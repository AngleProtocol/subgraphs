import { BigInt } from '@graphprotocol/graph-ts'
import {
  VaultManager,
  AccruedToTreasury,
  CollateralAmountUpdated,
  InterestAccumulatorUpdated,
  InternalDebtUpdated,
  FiledUint64,
  DebtCeilingUpdated,
  LiquidationBoostParametersUpdated,
  OracleUpdated,
  ToggledWhitelisting,
  Transfer,
  LiquidatedVaults
} from '../../generated/templates/VaultManagerTemplate/VaultManager'
import { Oracle } from '../../generated/templates/VaultManagerTemplate/Oracle'
import { VaultManagerData, VaultData, VaultLiquidation, VaultManagerRevenue } from '../../generated/schema'
import {
  isBurn,
  isMint,
  _initVaultManager,
  _addVaultManagerDataToHistory,
  _addVaultDataToHistory,
  _addVaultManagerRevenueToHistory
} from './vaultManagerHelpers'
import { historicalSlice, computeHealthFactor, computeDebt } from './utils'
import { log } from '@graphprotocol/graph-ts'

// update revenue info for a given vaultManager
export function handleAccruedToTreasury(event: AccruedToTreasury): void {
  log.warning('++++ AccruedToTreasury', [])
  const id = event.address.toHexString()
  let data = VaultManagerRevenue.load(id)
  if (data == null) {
    data = new VaultManagerRevenue(id)
    data.vaultManager = event.address.toHexString()
    data.surplus = event.params.surplusEndValue
    data.badDebt = event.params.badDebtEndValue
  } else {
    data.surplus = data.surplus.plus(event.params.surplusEndValue)
    data.badDebt = data.badDebt.plus(event.params.badDebtEndValue)
  }
  data.profits = data.surplus.minus(data.badDebt)
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerRevenueToHistory(data)
}

export function handleCollateralAmountUpdated(event: CollateralAmountUpdated): void {
  log.warning('++++ CollateralAmountUpdated', [])
  const vaultManager = VaultManager.bind(event.address)
  const oracle = Oracle.bind(vaultManager.oracle())
  const idVM = event.address.toHexString()
  const idVault = idVM + '_' + event.params.vaultID.toString()
  let dataVM = VaultManagerData.load(idVM)!
  let dataVault = VaultData.load(idVault)!
  if (event.params.isIncrease) {
    dataVM.collateralAmount = dataVM.collateralAmount.plus(event.params.collateralAmount)
    dataVault.collateralAmount = dataVault.collateralAmount.plus(event.params.collateralAmount)
    // recompute vault's health factor
    dataVault.healthFactor = computeHealthFactor(
      dataVault.collateralAmount,
      dataVM.collateralBase,
      oracle.read(),
      dataVault.debt,
      dataVM.collateralFactor
    )
  } else {
    dataVM.collateralAmount = dataVM.collateralAmount.minus(event.params.collateralAmount)
    dataVault.collateralAmount = dataVault.collateralAmount.minus(event.params.collateralAmount)
    // recompute vault's health factor
    dataVault.healthFactor = computeHealthFactor(
      dataVault.collateralAmount,
      dataVM.collateralBase,
      oracle.read(),
      dataVault.debt,
      dataVM.collateralFactor
    )
  }
  dataVM.timestamp = historicalSlice(event.block)
  dataVault.timestamp = historicalSlice(event.block)
  dataVM.blockNumber = event.block.number
  dataVault.blockNumber = event.block.number
  dataVM.save()
  dataVault.save()
  _addVaultManagerDataToHistory(dataVM)
  _addVaultDataToHistory(dataVault)
}
export function handleInterestAccumulatorUpdated(event: InterestAccumulatorUpdated): void {
  log.warning('++++ InterestAccumulatorUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  data.interestAccumulator = event.params.value
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}
export function handleInternalDebtUpdated(event: InternalDebtUpdated): void {
  log.warning('++++ InternalDebtUpdated', [])
  const idVM = event.address.toHexString()
  const idVault = idVM + '_' + event.params.vaultID.toString()
  let dataVM = VaultManagerData.load(idVM)!
  let dataVault = VaultData.load(idVault)!
  if (event.params.isIncrease) {
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.plus(event.params.internalAmount)
    dataVault.normalizedDebt = dataVault.normalizedDebt.plus(event.params.internalAmount)
  } else {
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.minus(event.params.internalAmount)
    dataVault.normalizedDebt = dataVault.normalizedDebt.minus(event.params.internalAmount)
  }
  // recompute non-normalized debt
  dataVM.totalDebt = computeDebt(dataVM.totalNormalizedDebt, dataVM.interestAccumulator)
  dataVault.debt = computeDebt(dataVault.normalizedDebt, dataVM.interestAccumulator)
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
  dataVM.timestamp = historicalSlice(event.block)
  dataVault.timestamp = historicalSlice(event.block)
  dataVM.blockNumber = event.block.number
  dataVault.blockNumber = event.block.number
  dataVM.save()
  dataVault.save()
  _addVaultManagerDataToHistory(dataVM)
  _addVaultDataToHistory(dataVault)
}

export function handleFiledUint64(event: FiledUint64): void {
  log.warning('++++ FiledUint64: {}', [event.params.what.toString()])
  let data = VaultManagerData.load(event.address.toHexString())!
  const paramName = event.params.what.toString()
  const paramValue = event.params.param
  if (paramName === 'collateralFactor') {
    data.collateralFactor = paramValue
  } else if (paramName === 'targetHealthFactor') {
    data.targetHealthFactor = paramValue
  } else if (paramName === 'borrowFee') {
    data.borrowFee = paramValue
  } else if (paramName === 'interestRate') {
    data.interestRate = paramValue
  } else if (paramName === 'liquidationSurcharge') {
    data.liquidationSurcharge = paramValue
  } else if (paramName === 'maxLiquidationDiscount') {
    data.maxLiquidationDiscount = paramValue
  }

  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}

export function handleDebtCeilingUpdated(event: DebtCeilingUpdated): void {
  log.warning('++++ DebtCeilingUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  data.debtCeiling = event.params.debtCeiling
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}

export function handleLiquidationBoostParametersUpdated(event: LiquidationBoostParametersUpdated): void {
  log.warning('++++ LiquidationBoostParametersUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  data.xLiquidationBoost = event.params.xBoost
  data.yLiquidationBoost = event.params.yBoost
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}

export function handleOracleUpdated(event: OracleUpdated): void {
  log.warning('++++ OracleUpdated', [])
  // do nothing for this event
}

export function handleToggledWhitelisting(event: ToggledWhitelisting): void {
  log.warning('++++ ToggledWhitelisting', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  data.whitelistingActivated = !data.whitelistingActivated
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}

export function handleTransfer(event: Transfer): void {
  log.warning('++++ Transfer', [])
  const id = event.address.toHexString() + '_' + event.params.tokenId.toString()
  let data: VaultData
  if (isMint(event)) {
    // Increase VM vault counter
    let dataVM = VaultManagerData.load(event.address.toHexString())!
    dataVM.activeVaultsCount = dataVM.activeVaultsCount.plus(BigInt.fromI32(1))
    dataVM.save()
    _addVaultManagerDataToHistory(dataVM)
    // Create a vault instance
    data = new VaultData(id)
    data.vaultManager = event.address.toHexString()
    data.vaultID = event.params.tokenId
    data.owner = event.params.to.toHexString()
    // vaults are created empty
    data.collateralAmount = BigInt.fromI32(0)
    data.normalizedDebt = BigInt.fromI32(0)
    data.debt = BigInt.fromI32(0)
    // healthFactor of 1 when vault has no debt
    data.healthFactor = BigInt.fromI32(1)
    data.isActive = true
  } else if (isBurn(event)) {
    // disable instance
    data = VaultData.load(id)!
    data.isActive = false
    // save collateral and debt prior to vault closing
    const vaultCollateral = data.collateralAmount
    const vaultDebt = data.normalizedDebt
    data.collateralAmount = BigInt.fromI32(0)
    data.normalizedDebt = BigInt.fromI32(0)
    data.debt = BigInt.fromI32(0)
    // healthFactor of 1 when vault has no debt
    data.healthFactor = BigInt.fromI32(1)
    // Decrease VM vault counter, collateralAmount and totalNormalizedDebt
    let dataVM = VaultManagerData.load(event.address.toHexString())!
    dataVM.activeVaultsCount = dataVM.activeVaultsCount.minus(BigInt.fromI32(1))
    dataVM.collateralAmount = dataVM.collateralAmount.minus(vaultCollateral)
    dataVM.totalNormalizedDebt = dataVM.totalNormalizedDebt.minus(vaultDebt)
    dataVM.totalDebt = computeDebt(dataVM.totalNormalizedDebt, dataVM.interestAccumulator)
    dataVM.save()
    _addVaultManagerDataToHistory(dataVM)
  } else {
    data = VaultData.load(id)!
    data.owner = event.params.to.toHexString()
  }
  data.blockNumber = event.block.number
  data.timestamp = event.block.timestamp
  data.save()
  _addVaultDataToHistory(data)
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
    let dataLiquidation = new VaultLiquidation(idLiquidation)

    // Fetch the current amount of collateral remaining in the vault
    let collateralAmount = vaultManager.vaultData(vaultID).value0
    let collateralBought = dataVault.collateralAmount.minus(collateralAmount)

    // When this event is fired, unlike collateral, debt has already been updated in latest vault entity
    let debt = dataVault.debt
    let debtRemoved = dataVault.debt.minus(debt)

    dataLiquidation.collateralBought = collateralBought
    dataLiquidation.debtRemoved = debtRemoved
    dataLiquidation.oraclePrice = oracle.read()

    dataLiquidation.timestamp = timestamp
    dataLiquidation.blockNumber = event.block.number
    dataLiquidation.save()

    dataVault.collateralAmount = dataVault.collateralAmount.minus(collateralBought)
    dataVM.collateralAmount = dataVM.collateralAmount.minus(collateralBought)
    dataVault.save()
    _addVaultDataToHistory(dataVault)
  }
  dataVM.save()
  _addVaultManagerDataToHistory(dataVM)
}