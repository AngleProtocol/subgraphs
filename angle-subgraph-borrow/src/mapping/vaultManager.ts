import { BigInt, store } from '@graphprotocol/graph-ts'
import {
  VaultManager,
  AccruedToTreasury,
  CollateralAmountUpdated,
  InterestAccumulatorUpdated,
  InternalDebtUpdated,
  FiledUint64,
  DebtCeilingUpdated,
  LiquidationBoostParametersUpdated,
  Transfer,
  LiquidatedVaults,
  DebtTransferred
} from '../../generated/templates/VaultManagerTemplate/VaultManager'
import { Oracle } from '../../generated/templates/VaultManagerTemplate/Oracle'
import { VaultManagerData,
  VaultData,
  OngoingDebtTransfer,
  VaultTransfer,
  CollateralUpdate,
  DebtUpdate,
  DebtTransfer,
  VaultLiquidation,
} from '../../generated/schema'
import {
  isBurn,
  isMint,
  computeHealthFactor,
  computeDebt,
  computeTVL,
  computeLiquidationDiscount,
  _initVaultManager,
  _addVaultManagerDataToHistory,
  _addVaultDataToHistory,
  _getActionId,
} from './vaultManagerHelpers'
import { BASE_INTEREST, BASE_PARAMS, MAX_UINT256 } from '../../../constants'
import { log } from '@graphprotocol/graph-ts'

const ZERO = BigInt.fromI32(0)

// update revenue info for a given vaultManager
export function handleAccruedToTreasury(event: AccruedToTreasury): void {
  log.warning('++++ AccruedToTreasury', [])
  const id = event.address.toHexString()
  let data = VaultManagerData.load(id)!
  data.pendingSurplus = ZERO
  data.pendingBadDebt = ZERO
  data.surplus = data.surplus.plus(event.params.surplusEndValue)
  data.badDebt = data.badDebt.plus(event.params.badDebtEndValue)
  data.profits = data.surplus.minus(data.badDebt)
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block)
}

export function handleCollateralAmountUpdated(event: CollateralAmountUpdated): void {
  log.warning('++++ CollateralAmountUpdated', [])
  const txHash = event.transaction.hash.toHexString()
  const vaultManager = VaultManager.bind(event.address)
  const oracle = Oracle.bind(vaultManager.oracle())
  const idVM = event.address.toHexString()
  const idVault = idVM + '_' + event.params.vaultID.toString()
  const actionID = _getActionId("collateralUpdate", txHash, event.block.timestamp)
  const dataVM = VaultManagerData.load(idVM)!
  const dataVault = VaultData.load(idVault)!
  const action = new CollateralUpdate(actionID)
  if (event.params.isIncrease) {
    dataVM.collateralAmount = dataVM.collateralAmount.plus(event.params.collateralAmount)
    dataVault.collateralAmount = dataVault.collateralAmount.plus(event.params.collateralAmount)
    action.isIncrease = true
  } else {
    dataVM.collateralAmount = dataVM.collateralAmount.minus(event.params.collateralAmount)
    dataVault.collateralAmount = dataVault.collateralAmount.minus(event.params.collateralAmount)
    action.isIncrease = false
  }
  // save action
  action.txHash = txHash
  action.vaultManager = dataVM.vaultManager
  action.vaultID = dataVault.vaultID
  action.amountUpdate = event.params.collateralAmount
  // update debt with interests
  dataVault.debt = computeDebt(
    dataVault.normalizedDebt,
    dataVM.interestRate,
    dataVM.interestAccumulator,
    dataVM.lastInterestAccumulatorUpdated,
    event.block.timestamp
  )
  // recompute vault's health factor
  dataVault.healthFactor = computeHealthFactor(
    dataVault.collateralAmount,
    dataVM.collateralBase,
    oracle.read(),
    dataVault.debt,
    dataVM.collateralFactor
  )
  dataVM.tvl = computeTVL(dataVM.collateralAmount, dataVM.collateralBase, dataVM.collateralTicker)
  action.sender = event.transaction.from.toHexString()
  action.recipient = event.transaction.to!.toHexString()
  dataVM.timestamp = event.block.timestamp
  dataVault.timestamp = event.block.timestamp
  action.timestamp = event.block.timestamp
  dataVM.blockNumber = event.block.number
  dataVault.blockNumber = event.block.number
  action.blockNumber = event.block.number
  dataVM.save()
  dataVault.save()
  action.save()
  _addVaultManagerDataToHistory(dataVM, event.block)
  _addVaultDataToHistory(dataVault, event.block)
}
export function handleInterestAccumulatorUpdated(event: InterestAccumulatorUpdated): void {
  log.warning('++++ InterestAccumulatorUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!

  // add new interests earned
  data.surplusFromInterests = data.surplusFromInterests.plus(event.params.value.minus(data.interestAccumulator).times(data.totalNormalizedDebt).div(BASE_INTEREST))

  data.interestAccumulator = event.params.value
  data.lastInterestAccumulatorUpdated = event.block.timestamp

  // Refresh surplus after interest accrual
  const vaultManager = VaultManager.bind(event.address)
  data.pendingSurplus = vaultManager.surplus()

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block)
}
export function handleInternalDebtUpdated(event: InternalDebtUpdated): void {
  log.warning('++++ InternalDebtUpdated ', [])
  const txHash = event.transaction.hash.toHexString()
  const idVM = event.address.toHexString()
  const idVault = idVM + '_' + event.params.vaultID.toString()
  const idOngoingDebtTransfer = event.block.timestamp.toString()
  const dataVM = VaultManagerData.load(idVM)!
  const dataVault = VaultData.load(idVault)!
  // Not null only when processing a debt transfer
  let dataOngoingDebtTransfer = OngoingDebtTransfer.load(idOngoingDebtTransfer)

  // compute non-normalized debt variation
  const debtVariation = computeDebt(
    event.params.internalAmount,
    dataVM.interestRate,
    dataVM.interestAccumulator,
    dataVM.lastInterestAccumulatorUpdated,
    event.block.timestamp
  )

  if (event.params.isIncrease) {
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.plus(event.params.internalAmount)
    dataVM.totalDebt = dataVM.totalDebt.plus(debtVariation)
    dataVault.normalizedDebt = dataVault.normalizedDebt.plus(event.params.internalAmount)
    if(dataOngoingDebtTransfer == null){
      // General case: compute borrow fee and add it to VM surplus
      const borrowFee = debtVariation.times(dataVM.borrowFee).div(BASE_PARAMS)
      dataVault.fees = dataVault.fees.plus(borrowFee)
      dataVM.surplusFromBorrowFees = dataVM.surplusFromBorrowFees.plus(borrowFee)

      // save action
      const idDebtUpdate = _getActionId("debtUpdate", txHash, event.block.timestamp)
      const actionDebtUpdate = new DebtUpdate(idDebtUpdate)
      actionDebtUpdate.txHash = txHash
      actionDebtUpdate.vaultManager = dataVM.vaultManager
      actionDebtUpdate.vaultID = dataVault.vaultID
      actionDebtUpdate.isIncrease = true
      actionDebtUpdate.amountUpdate = debtVariation
      actionDebtUpdate.sender = event.transaction.from.toHexString()
      actionDebtUpdate.recipient = event.transaction.to!.toHexString()
      actionDebtUpdate.timestamp = event.block.timestamp
      actionDebtUpdate.blockNumber = event.block.number
      actionDebtUpdate.save()
    }
    else if(dataOngoingDebtTransfer.srcVaultManager == event.address.toHexString() && dataOngoingDebtTransfer.srcVaultID == event.params.vaultID){
      // Debt transfer case, on srcVault:
      if(dataOngoingDebtTransfer.srcVaultManager != dataOngoingDebtTransfer.dstVaultManager){
        // compute difference in borrow fee and add it to VM surplus if positive
        const dataDstVM = VaultManagerData.load(dataOngoingDebtTransfer.dstVaultManager)!
        if(dataVM.borrowFee.gt(dataDstVM.borrowFee)){
          const ongoingdebttransferBorrowFee = dataVM.borrowFee.minus(dataDstVM.borrowFee).times(debtVariation).div(BASE_PARAMS)
          dataVault.fees = dataVault.fees.plus(ongoingdebttransferBorrowFee)
          dataVM.surplusFromBorrowFees = dataVM.surplusFromBorrowFees.plus(ongoingdebttransferBorrowFee)
        }
      }
      else{
        // don't do anything, no borrow fees are charged when transferring debt under the same vaultManager
      }
    }
    else{
      log.error("InternalDebtUpdated (increase) event doesn't match DebtTransferred record !", [])
    }
  } else {
    // Debt decrease
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.minus(event.params.internalAmount)
    dataVM.totalDebt = dataVM.totalDebt.minus(debtVariation)
    dataVault.normalizedDebt = dataVault.normalizedDebt.minus(event.params.internalAmount)

    if(dataOngoingDebtTransfer == null){
      // Check if this debt decrease is caused by a liquidation
      const idLiquidation = idVault + '_' + event.block.timestamp.toString()
      let actionLiquidation = VaultLiquidation.load(idLiquidation)
      if (actionLiquidation == null) {
        // General case: compute repay fee and add it to VM surplus
        const repayFee = debtVariation.times(dataVM.repayFee).div(BASE_PARAMS)
        dataVault.fees = dataVault.fees.plus(repayFee)
        dataVM.surplusFromRepayFees = dataVM.surplusFromRepayFees.plus(repayFee)

        // save action
        const idDebtUpdate = _getActionId("debtUpdate", txHash, event.block.timestamp)
        const actionDebtUpdate = new DebtUpdate(idDebtUpdate)
        actionDebtUpdate.txHash = txHash
        actionDebtUpdate.vaultManager = dataVM.vaultManager
        actionDebtUpdate.vaultID = dataVault.vaultID
        actionDebtUpdate.isIncrease = false
        actionDebtUpdate.amountUpdate = debtVariation
        actionDebtUpdate.sender = event.transaction.from.toHexString()
        actionDebtUpdate.recipient = event.transaction.to!.toHexString()
        actionDebtUpdate.timestamp = event.block.timestamp
        actionDebtUpdate.blockNumber = event.block.number
        actionDebtUpdate.save()
      }
      else{
        // Liquidation case:
        actionLiquidation.txHash = txHash
        actionLiquidation.debtRemoved = debtVariation
        actionLiquidation.liquidatorDiscount = computeLiquidationDiscount(actionLiquidation, dataVault, dataVM)
        actionLiquidation.liquidatorDeposit = actionLiquidation.collateralBought.times(actionLiquidation.oraclePrice).times(actionLiquidation.liquidatorDiscount!).div(dataVM.collateralBase).div(BASE_PARAMS)
        actionLiquidation.debtRepayed = actionLiquidation.liquidatorDeposit!.times(dataVM.liquidationSurcharge).div(BASE_PARAMS)
        actionLiquidation.surcharge = actionLiquidation.liquidatorDeposit!.minus(actionLiquidation.debtRepayed!)
        dataVault.fees = dataVault.fees.plus(actionLiquidation.surcharge!)
        dataVM.surplusFromLiquidationSurcharges = dataVM.surplusFromLiquidationSurcharges.plus(actionLiquidation.surcharge!)
        // Case where bad debt has been created
        if(dataVault.normalizedDebt.isZero() && dataVault.collateralAmount.isZero()){
          actionLiquidation.badDebt = debtVariation.minus(actionLiquidation.liquidatorDeposit!).plus(actionLiquidation.surcharge!)
        } else{
          actionLiquidation.badDebt = ZERO
        }
        actionLiquidation.save()
      }
    }
    else if(dataOngoingDebtTransfer.dstVaultManager == event.address.toHexString() && dataOngoingDebtTransfer.dstVaultID == event.params.vaultID){
      // Debt transfer case, on dstVault:
      if(dataOngoingDebtTransfer.srcVaultManager != dataOngoingDebtTransfer.dstVaultManager){
        // compute difference in repay fee and add it to VM surplus if positive
        const dataSrcVM = VaultManagerData.load(dataOngoingDebtTransfer.srcVaultManager)!
        if(dataVM.repayFee.gt(dataSrcVM.repayFee)){
          const ongoingdebttransferRepayFee = dataVM.repayFee.minus(dataSrcVM.repayFee).times(debtVariation).div(BASE_PARAMS)
          dataVM.surplusFromRepayFees = dataVM.surplusFromRepayFees.plus(ongoingdebttransferRepayFee)
          dataVault.fees = dataVault.fees.plus(ongoingdebttransferRepayFee)
        }
      }
      else{
         // don't do anything, no repay fees are charged when transferring debt under the same vaultManager
      }
      // End of life for OngoingDebtTransfer entity: DebtTransferred -> InternalDebtUpdated (increase) -> InternalDebtUpdated (decrease) -> EoL
      store.remove('OngoingDebtTransfer', idOngoingDebtTransfer)
    }
    else{
      log.error("InternalDebtUpdated (decrease) event doesn't match DebtTransferred record !", [])
    }
  }
  // Recompute current debts
  dataVault.debt = computeDebt(
    dataVault.normalizedDebt,
    dataVM.interestRate,
    dataVM.interestAccumulator,
    dataVM.lastInterestAccumulatorUpdated,
    event.block.timestamp
  )
  dataVM.totalDebt = computeDebt(
    dataVM.totalNormalizedDebt,
    dataVM.interestRate,
    dataVM.interestAccumulator,
    dataVM.lastInterestAccumulatorUpdated,
    event.block.timestamp
  )

  // recompute vault's health factor
  const vaultManager = VaultManager.bind(event.address)
  const oracle = Oracle.bind(vaultManager.oracle())
  // collateralAmount in the latest dataVault is potentially outdated, we can't rely on it
  const collateralAmount = vaultManager.vaultData(dataVault.vaultID).value0

  dataVault.healthFactor = computeHealthFactor(
    collateralAmount,
    dataVM.collateralBase,
    oracle.read(),
    dataVault.debt,
    dataVM.collateralFactor
  )

  // Refresh badDebt and surplus
  dataVM.pendingBadDebt = vaultManager.badDebt()
  dataVM.pendingSurplus = vaultManager.surplus()

  dataVM.timestamp = event.block.timestamp
  dataVault.timestamp = event.block.timestamp
  dataVM.blockNumber = event.block.number
  dataVault.blockNumber = event.block.number
  dataVM.save()
  dataVault.save()
  _addVaultManagerDataToHistory(dataVM, event.block)
  _addVaultDataToHistory(dataVault, event.block)
}

export function handleFiledUint64(event: FiledUint64): void {
  log.warning('++++ FiledUint64: {}', [event.params.what.toString()])
  const data = VaultManagerData.load(event.address.toHexString())!
  const paramName = event.params.what.toString()
  const paramValue = event.params.param
  if (paramName == 'CF') {
    data.collateralFactor = paramValue
  } else if (paramName == 'THF') {
    data.targetHealthFactor = paramValue
  } else if (paramName == 'BF') {
    data.borrowFee = paramValue
  } else if (paramName == 'RF') {
    data.repayFee = paramValue
  } else if (paramName == 'IR') {
    data.interestRate = paramValue
  } else if (paramName == 'LS') {
    data.liquidationSurcharge = paramValue
  } else if (paramName == 'MLD') {
    data.maxLiquidationDiscount = paramValue
  }
  else{
    log.error('++++ Unknown parameter {}: {}', [paramName, paramValue.toString()])
  }

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block)
}

export function handleDebtCeilingUpdated(event: DebtCeilingUpdated): void {
  log.warning('++++ DebtCeilingUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  data.debtCeiling = event.params.debtCeiling
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block)
}

export function handleLiquidationBoostParametersUpdated(event: LiquidationBoostParametersUpdated): void {
  log.warning('++++ LiquidationBoostParametersUpdated', [])
  const data = VaultManagerData.load(event.address.toHexString())!
  data.veBoostProxy = event.params._veBoostProxy.toHexString()
  data.xLiquidationBoost = event.params.xBoost
  data.yLiquidationBoost = event.params.yBoost
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block)
}

export function handleTransfer(event: Transfer): void {
  log.warning('++++ Transfer', [])
  const id = event.address.toHexString() + '_' + event.params.tokenId.toString()
  let data: VaultData
  if (isMint(event)) {
    // Increase VM vault counter
    let dataVM = VaultManagerData.load(event.address.toHexString())!
    dataVM.activeVaultsCount = dataVM.activeVaultsCount.plus(BigInt.fromI32(1))
    dataVM.timestamp = event.block.timestamp
    dataVM.blockNumber = event.block.number
    dataVM.save()
    _addVaultManagerDataToHistory(dataVM, event.block)
    // Create a vault instance
    data = new VaultData(id)
    data.vaultManager = event.address.toHexString()
    data.vaultID = event.params.tokenId
    data.openingDate = event.block.timestamp
    data.owner = event.params.to.toHexString()
    // vaults are created empty
    data.collateralAmount = ZERO
    data.normalizedDebt = ZERO
    data.debt = ZERO
    data.fees = ZERO
    // healthFactor of 2^256 when vault has no debt
    data.healthFactor = MAX_UINT256
    data.isActive = true
  } else if (isBurn(event)) {
    // disable instance
    data = VaultData.load(id)!
    data.isActive = false
    // save collateral and debt prior to vault closing
    const vaultCollateral = data.collateralAmount
    const vaultDebt = data.normalizedDebt
    data.collateralAmount = ZERO
    data.normalizedDebt = ZERO
    data.debt = ZERO
    // healthFactor of 2^256 when vault has no debt
    data.healthFactor = MAX_UINT256
    // Decrease VM vault counter, collateralAmount and totalNormalizedDebt
    let dataVM = VaultManagerData.load(event.address.toHexString())!
    dataVM.activeVaultsCount = dataVM.activeVaultsCount.minus(BigInt.fromI32(1))
    dataVM.collateralAmount = dataVM.collateralAmount.minus(vaultCollateral)
    dataVM.tvl = computeTVL(dataVM.collateralAmount, dataVM.collateralBase, dataVM.collateralTicker)
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.minus(vaultDebt)
    dataVM.totalDebt = computeDebt(
      dataVM.totalNormalizedDebt,
      dataVM.interestRate,
      dataVM.interestAccumulator,
      dataVM.lastInterestAccumulatorUpdated,
      event.block.timestamp
    )
    // Refresh surplus for repay fee
    const vaultManager = VaultManager.bind(event.address)
    dataVM.pendingSurplus = vaultManager.surplus()

    dataVM.timestamp = event.block.timestamp
    dataVM.blockNumber = event.block.number
    dataVM.save()
    _addVaultManagerDataToHistory(dataVM, event.block)
  } else {
    data = VaultData.load(id)!
    data.owner = event.params.to.toHexString()
  }
  data.blockNumber = event.block.number
  data.timestamp = event.block.timestamp
  data.save()
  _addVaultDataToHistory(data, event.block)

  // save action
  const txHash = event.transaction.hash.toHexString()
  const idVaultTransfer = _getActionId("vaultTransfer", txHash, event.block.timestamp)
  const action = new VaultTransfer(idVaultTransfer)
  action.txHash = txHash
  action.vaultManager = data.vaultManager
  action.vaultID = data.vaultID
  action.from = event.params.from.toHexString()
  action.to = event.params.to.toHexString()
  action.sender = event.transaction.from.toHexString()
  action.recipient = event.transaction.to!.toHexString()
  action.timestamp = event.block.timestamp
  action.blockNumber = event.block.number
  action.save()
}

// Update vaultManager and vault collateral + track liquidations
// Assumption: a given vault can't be liquidated multiple time in a single tx
export function handleLiquidatedVaults(event: LiquidatedVaults): void {
  log.warning('++++ LiquidatedVaults', [])
  const idVM = event.address.toHexString()
  const dataVM = VaultManagerData.load(idVM)!
  const timestamp = event.block.timestamp

  const vaultManager = VaultManager.bind(event.address)
  const oracle = Oracle.bind(vaultManager.oracle())
  for (let i = 0; i < event.params.vaultIDs.length; i++) {
    let vaultID = event.params.vaultIDs[i]
    let idVault = idVM + '_' + vaultID.toString()
    let dataVault = VaultData.load(idVault)!
    let idLiquidation = idVault + '_' + timestamp.toString()
    let action = new VaultLiquidation(idLiquidation)

    // Fetch the current amount of collateral remaining in the vault
    let collateralAmount = vaultManager.vaultData(vaultID).value0
    let collateralBought = dataVault.collateralAmount.minus(collateralAmount)

    action.liquidator = event.transaction.from.toHexString()
    action.collateralBought = collateralBought
    action.oraclePrice = oracle.read()
    // action.debtRemoved is going to be set later in `handleInternalDebtUpdated`

    action.vaultID = vaultID
    action.sender = event.transaction.from.toHexString()
    action.recipient = event.transaction.to!.toHexString()
    action.timestamp = timestamp
    action.blockNumber = event.block.number
    action.save()

    dataVault.collateralAmount = dataVault.collateralAmount.minus(collateralBought)
    dataVM.collateralAmount = dataVM.collateralAmount.minus(collateralBought)

    dataVault.timestamp = timestamp
    dataVault.blockNumber = event.block.number
    dataVault.save()
    _addVaultDataToHistory(dataVault, event.block)
  }
  dataVM.tvl = computeTVL(dataVM.collateralAmount, dataVM.collateralBase, dataVM.collateralTicker)

  dataVM.timestamp = timestamp
  dataVM.blockNumber = event.block.number
  dataVM.save()
  _addVaultManagerDataToHistory(dataVM, event.block)
}

// Stores getDebtIn/Out data to help further InternalDebtUpdated events
// Entities must be destroyed when getDebtIn/Out complete handling procedure is done, which
// means that the subgraph API should always return an empty array when requesting this entity.
// Otherwise, it would mess with InternalDebtUpdated events unrelated to getDebtIn/Out operations
export function handleDebtTransferred(event: DebtTransferred): void {
  log.warning('++++ DebtTransferred', [])
  const txHash = event.transaction.hash.toHexString()
  const idOngoingDebtTransferred = event.block.timestamp.toString()
  const idDebtTransfer = _getActionId("debtTransfer", txHash, event.block.timestamp)
  let data = OngoingDebtTransfer.load(idOngoingDebtTransferred)
  if(data == null){
    data = new OngoingDebtTransfer(idOngoingDebtTransferred)
  }
  data.srcVaultID = event.params.srcVaultID
  data.srcVaultManager = event.address.toHexString()
  data.dstVaultID = event.params.dstVaultID
  data.dstVaultManager = event.params.dstVaultManager.toHexString()
  data.save()

  // save action
  const action = new DebtTransfer(idDebtTransfer)
  action.txHash = txHash
  action.srcVaultManager = data.srcVaultManager
  action.srcVaultID = data.srcVaultID
  action.dstVaultManager = data.dstVaultManager
  action.dstVaultID = data.dstVaultID
  action.amount = event.params.amount
  action.sender = event.transaction.from.toHexString()
  action.recipient = event.transaction.to!.toHexString()
  action.timestamp = event.block.timestamp
  action.blockNumber = event.block.number
  action.save()
}