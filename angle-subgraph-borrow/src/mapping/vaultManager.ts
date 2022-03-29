import { store, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  VaultManager,
  AccruedToTreasury,
  CollateralAmountUpdated,
  InterestRateAccumulatorUpdated,
  InternalDebtUpdated,
  FiledUint64,
  DebtCeilingUpdated,
  LiquidationBoostParametersUpdated,
  OracleUpdated,
  ToggledWhitelisting
} from '../../generated/templates/VaultManagerTemplate/VaultManager'
import { AgToken } from '../../generated/TreasuryTemplate/AgToken'
import { VaultManagerData, VaultManagerHistoricalData } from '../../generated/schema'
import { historicalSlice , _addVaultManagerDataToHistory } from './utils'
import { log } from '@graphprotocol/graph-ts'

export function handleAccruedToTreasury(event: AccruedToTreasury): void {
  log.warning('++++ AccruedToTreasury', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  data.surplus = event.params.surplusEndValue
  data.badDebt = event.params.badDebtEndValue
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}
export function handleCollateralAmountUpdated(event: CollateralAmountUpdated): void {
  log.warning('++++ CollateralAmountUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  if(event.params.isIncrease){
    data.collateralAmount = data.collateralAmount.plus(event.params.collateralAmount)
  }
  else{
    data.collateralAmount = data.collateralAmount.minus(event.params.collateralAmount)
  }
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}
export function handleInterestAccumulatorUpdated(event: InterestRateAccumulatorUpdated): void {
  log.warning('++++ InterestRateAccumulatorUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  data.interestAccumulator = event.params.value
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}
export function handleInternalDebtUpdated(event: InternalDebtUpdated): void {
  log.warning('++++ InternalDebtUpdated', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  if(event.params.isIncrease){
    data.totalNormalizedDebt = data.totalNormalizedDebt.plus(event.params.internalAmount)
  }
  else{
    data.totalNormalizedDebt = data.totalNormalizedDebt.minus(event.params.internalAmount)
  }
  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addVaultManagerDataToHistory(data)
}

export function handleFiledUint64(event: FiledUint64): void {
  log.warning('++++ FiledUint64', [])
  let data = VaultManagerData.load(event.address.toHexString())!
  const paramName = event.params.what.toString()
  const paramValue = event.params.param
  log.warning("{}", [paramName])
  if(paramName === "collateralFactor"){
    data.collateralFactor = paramValue
  }else if(paramName === "targetHealthFactor"){
    data.targetHealthFactor = paramValue
  }else if(paramName === "borrowFee"){
    data.borrowFee = paramValue
  }else if(paramName === "interestRate"){
    data.interestRate = paramValue
  }else if(paramName === "liquidationSurcharge"){
    data.liquidationSurcharge = paramValue
  }else if(paramName === "maxLiquidationDiscount"){
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

