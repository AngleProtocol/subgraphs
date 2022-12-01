import { Address, BigInt, store } from '@graphprotocol/graph-ts'
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
import {
  VaultManagerData,
  VaultData,
  OngoingDebtTransfer,
  VaultTransfer,
  CollateralUpdate,
  DebtUpdate,
  DebtTransfer,
  VaultLiquidation,
  OracleByTicker,
  OracleData,
  FeeData
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
  _getActionId
} from './vaultManagerHelpers'
import { DECIMAL_INTEREST, DECIMAL_PARAMS, DECIMAL_TOKENS, MAX_DECIMAL, ONE_BD, ZERO_BD } from '../../../constants'
import { log } from '@graphprotocol/graph-ts'
import { getToken } from './utils'
import { convertTokenListToDecimal, convertTokenToDecimal } from '../utils'

const ZERO = BigInt.fromI32(0)

// update revenue info for a given vaultManager
export function handleAccruedToTreasury(event: AccruedToTreasury): void {
  log.warning('++++ AccruedToTreasury', [])
  const id = event.address.toHexString()
  let data = VaultManagerData.load(id)!
  const collateralInfo = getToken(Address.fromString(data.collateral))
  data.pendingSurplus = ZERO_BD
  data.pendingBadDebt = ZERO_BD
  data.surplus = data.surplus.plus(convertTokenToDecimal(event.params.surplusEndValue, collateralInfo.decimals))
  data.badDebt = data.badDebt.plus(convertTokenToDecimal(event.params.badDebtEndValue, collateralInfo.decimals))
  data.profits = data.surplus.minus(data.badDebt)
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block, null)
}

export function handleCollateralAmountUpdated(event: CollateralAmountUpdated): void {
  log.warning('++++ CollateralAmountUpdated', [])
  const txHash = event.transaction.hash.toHexString()
  const vaultManager = VaultManager.bind(event.address)
  const oracle = Oracle.bind(vaultManager.oracle())
  const idVM = event.address.toHexString()
  const idVault = idVM + '_' + event.params.vaultID.toString()
  const actionID = _getActionId('collateralUpdate', txHash, event.block.timestamp)
  const dataVM = VaultManagerData.load(idVM)!
  const dataVault = VaultData.load(idVault)!
  const action = new CollateralUpdate(actionID)
  const collateralInfo = getToken(Address.fromString(dataVM.collateral))

  const collateralAmountDecimal = convertTokenToDecimal(event.params.collateralAmount, collateralInfo.decimals)
  if (event.params.isIncrease) {
    dataVM.collateralAmount = dataVM.collateralAmount.plus(collateralAmountDecimal)
    dataVault.collateralAmount = dataVault.collateralAmount.plus(collateralAmountDecimal)
    action.isIncrease = true
  } else {
    dataVM.collateralAmount = dataVM.collateralAmount.minus(collateralAmountDecimal)
    dataVault.collateralAmount = dataVault.collateralAmount.minus(collateralAmountDecimal)
    action.isIncrease = false
  }
  // save action
  action.txHash = txHash
  action.vaultManager = dataVM.vaultManager
  action.vaultID = dataVault.vaultID
  action.owner = dataVault.owner
  action.amountUpdate = collateralAmountDecimal
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
    convertTokenToDecimal(oracle.read(), DECIMAL_TOKENS),
    dataVault.debt,
    dataVM.collateralFactor
  )
  dataVM.tvl = computeTVL(dataVM.collateralAmount, dataVM.collateralTicker)
  action.txOrigin = event.transaction.from.toHexString()
  action.txTarget = event.transaction.to!.toHexString()
  dataVM.timestamp = event.block.timestamp
  dataVault.timestamp = event.block.timestamp
  action.timestamp = event.block.timestamp
  dataVM.blockNumber = event.block.number
  dataVault.blockNumber = event.block.number
  action.blockNumber = event.block.number
  dataVM.save()
  dataVault.save()
  action.save()
  _addVaultManagerDataToHistory(dataVM, event.block, null)
  _addVaultDataToHistory(dataVault, event.block)
}
export function handleInterestAccumulatorUpdated(event: InterestAccumulatorUpdated): void {
  log.warning('++++ InterestAccumulatorUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  const agTokenInfo = getToken(Address.fromString(data.agToken))

  // add new interests earned
  const interestEarned =
    convertTokenToDecimal(event.params.value
      .minus(data.interestAccumulator)
      , DECIMAL_INTEREST)
      .times(data.totalNormalizedDebt)
  data.surplusFromInterests = data.surplusFromInterests.plus(interestEarned)

  data.interestAccumulator = event.params.value
  data.lastInterestAccumulatorUpdated = event.block.timestamp

  // Refresh surplus after interest accrual
  const vaultManager = VaultManager.bind(event.address)
  data.pendingSurplus = convertTokenToDecimal(vaultManager.surplus(), agTokenInfo.decimals)

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()

  // Update the global revenue values
  const feeData = FeeData.load('0')!
  const agTokenPriceInUSD = OracleData.load(OracleByTicker.load(data.agTokenTicker)!.oracle)!
  feeData.surplusFromInterests = feeData.surplusFromInterests.plus(interestEarned.times(agTokenPriceInUSD.price))
  feeData.save()

  _addVaultManagerDataToHistory(data, event.block, feeData)

}
export function handleInternalDebtUpdated(event: InternalDebtUpdated): void {
  log.warning('++++ InternalDebtUpdated ', [])
  const txHash = event.transaction.hash.toHexString()
  const idVM = event.address.toHexString()
  const idVault = idVM + '_' + event.params.vaultID.toString()
  const idOngoingDebtTransfer = event.block.timestamp.toString()
  const dataVM = VaultManagerData.load(idVM)!
  const dataVault = VaultData.load(idVault)!
  const agTokenInfo = getToken(Address.fromString(dataVM.agToken))
  const collateralInfo = getToken(Address.fromString(dataVM.collateral))
  // Not null only when processing a debt transfer
  let dataOngoingDebtTransfer = OngoingDebtTransfer.load(idOngoingDebtTransfer)

  const internalAmountDeciaml = convertTokenToDecimal(event.params.internalAmount, agTokenInfo.decimals)
  // compute non-normalized debt variation
  const debtVariation = computeDebt(
    internalAmountDeciaml,
    dataVM.interestRate,
    dataVM.interestAccumulator,
    dataVM.lastInterestAccumulatorUpdated,
    event.block.timestamp
  )

  // Update the global revenue values
  const feeData = FeeData.load('0')!
  const agTokenPriceInUSD = OracleData.load(OracleByTicker.load(dataVM.agTokenTicker)!.oracle)!

  if (event.params.isIncrease) {
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.plus(internalAmountDeciaml)
    dataVM.totalDebt = dataVM.totalDebt.plus(debtVariation)
    dataVault.normalizedDebt = dataVault.normalizedDebt.plus(internalAmountDeciaml)

    if (dataOngoingDebtTransfer == null) {
      // General case: compute borrow fee and add it to VM surplus and global surplus
      const borrowFee = debtVariation.times(dataVM.borrowFee)
      dataVault.fees = dataVault.fees.plus(borrowFee)
      dataVM.surplusFromBorrowFees = dataVM.surplusFromBorrowFees.plus(borrowFee)
      feeData.surplusFromBorrowFees = feeData.surplusFromBorrowFees.plus(borrowFee.times(agTokenPriceInUSD.price))

      // save action
      const idDebtUpdate = _getActionId('debtUpdate', txHash, event.block.timestamp)
      const actionDebtUpdate = new DebtUpdate(idDebtUpdate)
      actionDebtUpdate.txHash = txHash
      actionDebtUpdate.vaultManager = dataVM.vaultManager
      actionDebtUpdate.vaultID = dataVault.vaultID
      actionDebtUpdate.owner = dataVault.owner
      actionDebtUpdate.isIncrease = true
      actionDebtUpdate.amountUpdate = debtVariation
      actionDebtUpdate.txOrigin = event.transaction.from.toHexString()
      actionDebtUpdate.txTarget = event.transaction.to!.toHexString()
      actionDebtUpdate.timestamp = event.block.timestamp
      actionDebtUpdate.blockNumber = event.block.number
      actionDebtUpdate.save()
    } else if (
      dataOngoingDebtTransfer.srcVaultManager == event.address.toHexString() &&
      dataOngoingDebtTransfer.srcVaultID == event.params.vaultID
    ) {
      // Debt transfer case, on srcVault:
      if (dataOngoingDebtTransfer.srcVaultManager != dataOngoingDebtTransfer.dstVaultManager) {
        // compute difference in borrow fee and add it to VM/global surplus if positive
        const dataDstVM = VaultManagerData.load(dataOngoingDebtTransfer.dstVaultManager)!
        if (dataVM.borrowFee.gt(dataDstVM.borrowFee)) {
          const ongoingdebttransferBorrowFee = dataVM.borrowFee
            .minus(dataDstVM.borrowFee)
            .times(debtVariation)
          dataVault.fees = dataVault.fees.plus(ongoingdebttransferBorrowFee)
          dataVM.surplusFromBorrowFees = dataVM.surplusFromBorrowFees.plus(ongoingdebttransferBorrowFee)
          feeData.surplusFromBorrowFees = feeData.surplusFromBorrowFees.plus(ongoingdebttransferBorrowFee.times(agTokenPriceInUSD.price))
        }
      } else {
        // don't do anything, no borrow fees are charged when transferring debt under the same vaultManager
      }
    } else {
      log.error("InternalDebtUpdated (increase) event doesn't match DebtTransferred record !", [])
    }
  } else {
    // Debt decrease
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.minus(internalAmountDeciaml)
    dataVM.totalDebt = dataVM.totalDebt.minus(debtVariation)
    dataVault.normalizedDebt = dataVault.normalizedDebt.minus(internalAmountDeciaml)

    if (dataOngoingDebtTransfer == null) {
      // Check if this debt decrease is caused by a liquidation
      const idLiquidation = idVault + '_' + event.block.timestamp.toString()
      let actionLiquidation = VaultLiquidation.load(idLiquidation)
      if (actionLiquidation == null) {
        // General case: compute repay fee and add it to VM surplus
        const repayFee = debtVariation.times(dataVM.repayFee)
        dataVault.fees = dataVault.fees.plus(repayFee)
        dataVM.surplusFromRepayFees = dataVM.surplusFromRepayFees.plus(repayFee)
        feeData.surplusFromRepayFees = feeData.surplusFromRepayFees.plus(repayFee.times(agTokenPriceInUSD.price))

        // save action
        const idDebtUpdate = _getActionId('debtUpdate', txHash, event.block.timestamp)
        const actionDebtUpdate = new DebtUpdate(idDebtUpdate)
        actionDebtUpdate.txHash = txHash
        actionDebtUpdate.vaultManager = dataVM.vaultManager
        actionDebtUpdate.vaultID = dataVault.vaultID
        actionDebtUpdate.owner = dataVault.owner
        actionDebtUpdate.isIncrease = false
        actionDebtUpdate.amountUpdate = debtVariation
        actionDebtUpdate.txOrigin = event.transaction.from.toHexString()
        actionDebtUpdate.txTarget = event.transaction.to!.toHexString()
        actionDebtUpdate.timestamp = event.block.timestamp
        actionDebtUpdate.blockNumber = event.block.number
        actionDebtUpdate.save()
      } else {
        // Liquidation case:
        actionLiquidation.txHash = txHash
        actionLiquidation.debtRemoved = debtVariation
        actionLiquidation.liquidatorDiscount = computeLiquidationDiscount(actionLiquidation, dataVault, dataVM)
        actionLiquidation.liquidatorDeposit = actionLiquidation.collateralBought
          .times(actionLiquidation.oraclePrice)
          .times(ONE_BD.minus(actionLiquidation.liquidatorDiscount!))
        actionLiquidation.debtRepayed = actionLiquidation
          .liquidatorDeposit!.times(dataVM.liquidationSurcharge)
        actionLiquidation.surcharge = actionLiquidation.liquidatorDeposit!.minus(actionLiquidation.debtRepayed!)
        dataVault.fees = dataVault.fees.plus(actionLiquidation.surcharge!)
        dataVM.surplusFromLiquidationSurcharges = dataVM.surplusFromLiquidationSurcharges.plus(
          actionLiquidation.surcharge!
        )
        feeData.surplusFromLiquidationSurcharges = feeData.surplusFromLiquidationSurcharges.plus(actionLiquidation.surcharge!)
        dataVM.liquidationRepayments = dataVM.liquidationRepayments.plus(actionLiquidation.debtRepayed!)
        // Case where bad debt has been created
        if (dataVault.normalizedDebt.equals(ZERO_BD) && dataVault.collateralAmount.equals(ZERO_BD)) {
          actionLiquidation.badDebt = debtVariation
            .minus(actionLiquidation.liquidatorDeposit!)
            .plus(actionLiquidation.surcharge!)
        } else {
          actionLiquidation.badDebt = ZERO_BD
        }
        actionLiquidation.save()
        // Add to liquidations stats
        const oracleUSD = OracleData.load(OracleByTicker.load(dataVM.agTokenTicker)!.oracle)!.price
        const debtsRepayed = dataVM.liquidationDebtsRepayed
        const debtsRemoved = dataVM.liquidationDebtsRemoved
        const debtsRemaining = dataVM.liquidationDebtsRemaining
        const collateralsBought = dataVM.liquidationCollateralsBought
        const collateralsRemaining = dataVM.liquidationCollateralsRemaining
        const timestamps = dataVM.liquidationTimestamps
        debtsRepayed.push(actionLiquidation.debtRepayed!.times(oracleUSD))
        debtsRemoved.push(actionLiquidation.debtRemoved!.times(oracleUSD))
        let debtRemaining = dataVault.debt.minus(debtVariation)
        if (debtRemaining.lt(ZERO_BD)) debtRemaining = ZERO_BD
        debtsRemaining.push(debtRemaining.times(oracleUSD))
        collateralsBought.push(
          actionLiquidation.collateralBought
            .times(oracleUSD)
            .times(dataVM.oracleValue)
        )

        let collateralRemaining = dataVault.collateralAmount
        if (collateralRemaining.lt(ZERO_BD)) collateralRemaining = ZERO_BD
        collateralsRemaining.push(
          collateralRemaining
            .times(oracleUSD)
            .times(dataVM.oracleValue)
        )
        timestamps.push(event.block.timestamp)
        dataVM.liquidationDebtsRepayed = debtsRepayed
        dataVM.liquidationDebtsRemoved = debtsRemoved
        dataVM.liquidationDebtsRemaining = debtsRemaining
        dataVM.liquidationCollateralsBought = collateralsBought
        dataVM.liquidationCollateralsRemaining = collateralsRemaining
        dataVM.liquidationTimestamps = timestamps
      }
    } else if (
      dataOngoingDebtTransfer.dstVaultManager == event.address.toHexString() &&
      dataOngoingDebtTransfer.dstVaultID == event.params.vaultID
    ) {
      // Debt transfer case, on dstVault:
      if (dataOngoingDebtTransfer.srcVaultManager != dataOngoingDebtTransfer.dstVaultManager) {
        // compute difference in repay fee and add it to VM/global surplus if positive
        const dataSrcVM = VaultManagerData.load(dataOngoingDebtTransfer.srcVaultManager)!
        if (dataVM.repayFee.gt(dataSrcVM.repayFee)) {
          const ongoingdebttransferRepayFee = dataVM.repayFee
            .minus(dataSrcVM.repayFee)
            .times(debtVariation)
          dataVM.surplusFromRepayFees = dataVM.surplusFromRepayFees.plus(ongoingdebttransferRepayFee)
          dataVault.fees = dataVault.fees.plus(ongoingdebttransferRepayFee)
          feeData.surplusFromRepayFees = feeData.surplusFromRepayFees.plus(ongoingdebttransferRepayFee.times(agTokenPriceInUSD.price))
        }
      } else {
        // don't do anything, no repay fees are charged when transferring debt under the same vaultManager
      }
      // End of life for OngoingDebtTransfer entity: DebtTransferred -> InternalDebtUpdated (increase) -> InternalDebtUpdated (decrease) -> EoL
      store.remove('OngoingDebtTransfer', idOngoingDebtTransfer)
    } else {
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
  const collateralAmount = convertTokenToDecimal(vaultManager.vaultData(dataVault.vaultID).value0, collateralInfo.decimals)

  dataVault.healthFactor = computeHealthFactor(
    collateralAmount,
    convertTokenToDecimal(oracle.read(), DECIMAL_TOKENS),
    dataVault.debt,
    dataVM.collateralFactor
  )

  // Refresh badDebt and surplus
  dataVM.pendingBadDebt = convertTokenToDecimal(vaultManager.badDebt(), agTokenInfo.decimals)
  dataVM.pendingSurplus = convertTokenToDecimal(vaultManager.surplus(), agTokenInfo.decimals)

  dataVM.timestamp = event.block.timestamp
  dataVault.timestamp = event.block.timestamp
  dataVM.blockNumber = event.block.number
  dataVault.blockNumber = event.block.number
  dataVM.save()
  dataVault.save()
  feeData.save()
  _addVaultManagerDataToHistory(dataVM, event.block, feeData)
  _addVaultDataToHistory(dataVault, event.block)
}

export function handleFiledUint64(event: FiledUint64): void {
  log.warning('++++ FiledUint64: {}', [event.params.what.toString()])
  const data = VaultManagerData.load(event.address.toHexString())!
  const paramName = event.params.what.toString()
  const paramValue = event.params.param
  if (paramName == 'CF') {
    data.collateralFactor = convertTokenToDecimal(paramValue, DECIMAL_PARAMS)
  } else if (paramName == 'THF') {
    data.targetHealthFactor = convertTokenToDecimal(paramValue, DECIMAL_PARAMS)
  } else if (paramName == 'BF') {
    data.borrowFee = convertTokenToDecimal(paramValue, DECIMAL_PARAMS)
  } else if (paramName == 'RF') {
    data.repayFee = convertTokenToDecimal(paramValue, DECIMAL_PARAMS)
  } else if (paramName == 'IR') {
    data.interestRate = paramValue
  } else if (paramName == 'LS') {
    data.liquidationSurcharge = convertTokenToDecimal(paramValue, DECIMAL_PARAMS)
  } else if (paramName == 'MLD') {
    data.maxLiquidationDiscount = convertTokenToDecimal(paramValue, DECIMAL_PARAMS)
  } else {
    log.error('++++ Unknown parameter {}: {}', [paramName, paramValue.toString()])
  }

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block, null)
}

export function handleDebtCeilingUpdated(event: DebtCeilingUpdated): void {
  log.warning('++++ DebtCeilingUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  const agTokenInfo = getToken(Address.fromString(data.agToken))
  data.debtCeiling = convertTokenToDecimal(event.params.debtCeiling, agTokenInfo.decimals)
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block, null)
}

export function handleLiquidationBoostParametersUpdated(event: LiquidationBoostParametersUpdated): void {
  log.warning('++++ LiquidationBoostParametersUpdated', [])
  const data = VaultManagerData.load(event.address.toHexString())!
  data.veBoostProxy = event.params._veBoostProxy.toHexString()
  data.xLiquidationBoost = convertTokenListToDecimal(event.params.xBoost, DECIMAL_PARAMS)
  data.yLiquidationBoost = convertTokenListToDecimal(event.params.yBoost, DECIMAL_PARAMS)
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data, event.block, null)
}

export function handleTransfer(event: Transfer): void {
  log.warning('++++ Transfer', [])
  const txHash = event.transaction.hash.toHexString()
  const id = event.address.toHexString() + '_' + event.params.tokenId.toString()
  let dataVault: VaultData
  if (isMint(event)) {
    // Increase VM vault counter
    let dataVM = VaultManagerData.load(event.address.toHexString())!
    dataVM.activeVaultsCount = dataVM.activeVaultsCount.plus(BigInt.fromI32(1))
    dataVM.timestamp = event.block.timestamp
    dataVM.blockNumber = event.block.number
    dataVM.save()
    _addVaultManagerDataToHistory(dataVM, event.block, null)
    // Create a vault instance
    dataVault = new VaultData(id)
    dataVault.vaultManager = event.address.toHexString()
    dataVault.vaultID = event.params.tokenId
    dataVault.openingDate = event.block.timestamp
    dataVault.owner = event.params.to.toHexString()
    // vaults are created empty
    dataVault.collateralAmount = ZERO_BD
    dataVault.normalizedDebt = ZERO_BD
    dataVault.debt = ZERO_BD
    dataVault.fees = ZERO_BD
    // healthFactor of 2^256 when vault has no debt
    dataVault.healthFactor = MAX_DECIMAL
    dataVault.isActive = true
  } else if (isBurn(event)) {
    // disable instance
    dataVault = VaultData.load(id)!
    dataVault.isActive = false
    // save collateral and debt prior to vault closing
    const collateralRemoved = dataVault.collateralAmount
    const normalizedDebtRemoved = dataVault.normalizedDebt
    dataVault.collateralAmount = ZERO_BD
    dataVault.normalizedDebt = ZERO_BD
    dataVault.debt = ZERO_BD
    // healthFactor of 2^256 when vault has no debt
    dataVault.healthFactor = MAX_DECIMAL
    // Decrease VM vault counter, collateralAmount and totalNormalizedDebt
    let dataVM = VaultManagerData.load(event.address.toHexString())!
    const agTokenInfo = getToken(Address.fromString(dataVM.agToken))
    dataVM.activeVaultsCount = dataVM.activeVaultsCount.minus(BigInt.fromI32(1))
    dataVM.collateralAmount = dataVM.collateralAmount.minus(collateralRemoved)
    dataVM.tvl = computeTVL(dataVM.collateralAmount, dataVM.collateralTicker)
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.minus(normalizedDebtRemoved)
    dataVM.totalDebt = computeDebt(
      dataVM.totalNormalizedDebt,
      dataVM.interestRate,
      dataVM.interestAccumulator,
      dataVM.lastInterestAccumulatorUpdated,
      event.block.timestamp
    )
    // Refresh surplus for repay fee
    const vaultManager = VaultManager.bind(event.address)
    dataVM.pendingSurplus = convertTokenToDecimal(vaultManager.surplus(), agTokenInfo.decimals)

    dataVM.timestamp = event.block.timestamp
    dataVM.blockNumber = event.block.number
    dataVM.save()
    _addVaultManagerDataToHistory(dataVM, event.block, null)

    // save repayDebt and removeCollateral actions
    if (!normalizedDebtRemoved.equals(ZERO_BD)) {
      const actionDebtUpdate = new DebtUpdate(_getActionId('debtUpdate', txHash, event.block.timestamp))
      actionDebtUpdate.txHash = txHash
      actionDebtUpdate.vaultManager = dataVM.vaultManager
      actionDebtUpdate.vaultID = dataVault.vaultID
      actionDebtUpdate.owner = dataVault.owner
      actionDebtUpdate.isIncrease = false
      actionDebtUpdate.amountUpdate = computeDebt(
        normalizedDebtRemoved,
        dataVM.interestRate,
        dataVM.interestAccumulator,
        dataVM.lastInterestAccumulatorUpdated,
        event.block.timestamp
      )
      actionDebtUpdate.txOrigin = event.transaction.from.toHexString()
      actionDebtUpdate.txTarget = event.transaction.to!.toHexString()
      actionDebtUpdate.timestamp = event.block.timestamp
      actionDebtUpdate.blockNumber = event.block.number
      actionDebtUpdate.save()
    }

    if (!collateralRemoved.equals(ZERO_BD)) {
      const actionCollateralUpdate = new CollateralUpdate(
        _getActionId('collateralUpdate', txHash, event.block.timestamp)
      )
      actionCollateralUpdate.txHash = txHash
      actionCollateralUpdate.vaultManager = dataVM.vaultManager
      actionCollateralUpdate.vaultID = dataVault.vaultID
      actionCollateralUpdate.owner = dataVault.owner
      actionCollateralUpdate.isIncrease = false
      actionCollateralUpdate.amountUpdate = collateralRemoved
      actionCollateralUpdate.txOrigin = event.transaction.from.toHexString()
      actionCollateralUpdate.txTarget = event.transaction.to!.toHexString()
      actionCollateralUpdate.timestamp = event.block.timestamp
      actionCollateralUpdate.blockNumber = event.block.number
      actionCollateralUpdate.save()
    }
  } else {
    dataVault = VaultData.load(id)!
    dataVault.owner = event.params.to.toHexString()
  }
  dataVault.blockNumber = event.block.number
  dataVault.timestamp = event.block.timestamp
  dataVault.save()
  _addVaultDataToHistory(dataVault, event.block)

  // save action
  const idVaultTransfer = _getActionId('vaultTransfer', txHash, event.block.timestamp)
  const action = new VaultTransfer(idVaultTransfer)
  action.txHash = txHash
  action.vaultManager = dataVault.vaultManager
  action.vaultID = dataVault.vaultID
  action.previousOwner = event.params.from.toHexString()
  action.newOwner = event.params.to.toHexString()
  action.txOrigin = event.transaction.from.toHexString()
  action.txTarget = event.transaction.to!.toHexString()
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
  const collateralInfo = getToken(Address.fromString(dataVM.collateral))
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
    let collateralBought = dataVault.collateralAmount.minus(convertTokenToDecimal(collateralAmount, collateralInfo.decimals))

    action.collateralBought = collateralBought
    action.oraclePrice = convertTokenToDecimal(oracle.read(), DECIMAL_TOKENS)
    // action.debtRemoved is going to be set later in `handleInternalDebtUpdated`

    action.vaultManager = dataVault.vaultManager
    action.vaultID = vaultID
    action.owner = dataVault.owner
    action.txOrigin = event.transaction.from.toHexString()
    action.txTarget = event.transaction.to!.toHexString()
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
  dataVM.tvl = computeTVL(dataVM.collateralAmount, dataVM.collateralTicker)

  dataVM.timestamp = timestamp
  dataVM.blockNumber = event.block.number
  dataVM.save()
  _addVaultManagerDataToHistory(dataVM, event.block, null)
}

// Stores getDebtIn/Out data to help further InternalDebtUpdated events
// Entities must be destroyed when getDebtIn/Out complete handling procedure is done, which
// means that the subgraph API should always return an empty array when requesting this entity.
// Otherwise, it would mess with InternalDebtUpdated events unrelated to getDebtIn/Out operations
export function handleDebtTransferred(event: DebtTransferred): void {
  log.warning('++++ DebtTransferred', [])
  const txHash = event.transaction.hash.toHexString()
  const idOngoingDebtTransferred = event.block.timestamp.toString()
  const idDebtTransfer = _getActionId('debtTransfer', txHash, event.block.timestamp)
  let data = OngoingDebtTransfer.load(idOngoingDebtTransferred)
  if (data == null) {
    data = new OngoingDebtTransfer(idOngoingDebtTransferred)
  }
  data.srcVaultID = event.params.srcVaultID
  data.srcVaultManager = event.address.toHexString()
  data.dstVaultID = event.params.dstVaultID
  data.dstVaultManager = event.params.dstVaultManager.toHexString()
  data.save()

  // save action
  const srcVaultData = VaultData.load(data.srcVaultManager + '_' + data.srcVaultID.toString())!
  const dstVaultData = VaultData.load(data.dstVaultManager + '_' + data.dstVaultID.toString())!
  const vmData = VaultManagerData.load(srcVaultData.vaultManager)!
  const collateralInfo = getToken(Address.fromString(vmData.collateral))
  const action = new DebtTransfer(idDebtTransfer)
  action.txHash = txHash
  action.srcVaultManager = data.srcVaultManager
  action.srcVaultID = data.srcVaultID
  action.srcOwner = srcVaultData.owner
  action.dstVaultManager = data.dstVaultManager
  action.dstVaultID = data.dstVaultID
  action.dstOwner = dstVaultData.owner
  action.amount = convertTokenToDecimal(event.params.amount, collateralInfo.decimals)
  action.txOrigin = event.transaction.from.toHexString()
  action.txTarget = event.transaction.to!.toHexString()
  action.timestamp = event.block.timestamp
  action.blockNumber = event.block.number
  action.save()
}
