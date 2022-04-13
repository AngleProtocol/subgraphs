import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import { ERC20 } from '../../generated/templates/VaultManagerTemplate/ERC20'
import { VaultManager, Transfer } from '../../generated/templates/VaultManagerTemplate/VaultManager'
import { Oracle } from '../../generated/templates/VaultManagerTemplate/Oracle'
import { VaultManagerTemplate } from '../../generated/templates'
import { VaultManagerData, VaultManagerHistoricalData, VaultData, VaultHistoricalData, VaultLiquidation } from '../../generated/schema'
import { historicalSlice } from './utils'
import { BASE_PARAMS, BASE_TOKENS, BASE_INTEREST, MAX_UINT256 } from '../../../constants'
import {
  VeBoostProxy
} from '../../generated/templates/VaultManagerTemplate/VeBoostProxy'

import { log } from '@graphprotocol/graph-ts'


export function computeLiquidationDiscount(dataLiquidation: VaultLiquidation, dataVault: VaultData, dataVM: VaultManagerData): BigInt {
  let liquidationBoost: BigInt;
  const x = dataVM.xLiquidationBoost
  const y = dataVM.yLiquidationBoost
  if(dataVM.veBoostProxy == "0x0000000000000000000000000000000000000000"){
    liquidationBoost = y[0]
  }
  else{
    const veBoostProxy = VeBoostProxy.bind(Address.fromString(dataVM.veBoostProxy))
    const adjustedBalance = veBoostProxy.adjusted_balance_of(Address.fromString(dataLiquidation.liquidator))

    if (adjustedBalance >= x[1]){
      liquidationBoost = y[1]
    }
    else if(adjustedBalance <= x[0]){
      liquidationBoost = y[0]
    }
    else{
      liquidationBoost = y[0].plus(y[1].minus(y[0]).times(adjustedBalance.minus(x[0]))).div(x[1].minus(x[0]))
    }
  }

  const collateralBeforeLiquidation = dataLiquidation.collateralBought.plus(dataVault.collateralAmount)
  // log.warning(" === {} {} {} {} {}", [collateralBeforeLiquidation.toString(), dataVM.collateralBase.toString(), dataLiquidation.oraclePrice.toString(), dataVault.debt.toString(), dataVM.collateralFactor.toString()])
  const healthFactor = computeHealthFactor(collateralBeforeLiquidation, dataVM.collateralBase, dataLiquidation.oraclePrice, dataVault.debt, dataVM.collateralFactor)
  let liquidationDiscount = liquidationBoost.times(BASE_PARAMS.minus(healthFactor)).div(BASE_PARAMS)
  if(liquidationDiscount.gt(dataVM.maxLiquidationDiscount)){
    liquidationDiscount = dataVM.maxLiquidationDiscount
  }
  return BASE_PARAMS.minus(liquidationDiscount)
}

export function computeDebt(
  normalizedDebt: BigInt,
  ratePerSecond: BigInt,
  interestAccumulator: BigInt,
  lastInterestAccumulatorUpdated: BigInt,
  timestamp: BigInt
): BigInt {
  const exp = timestamp.minus(lastInterestAccumulatorUpdated)
  let currentInterestAccumulator = interestAccumulator
  if (!exp.isZero() && !ratePerSecond.isZero()) {
    const ZERO = BigInt.fromI32(0)
    const ONE = BigInt.fromI32(1)
    const TWO = BigInt.fromI32(2)
    const SIX = BigInt.fromI32(6)
    const HALF_BASE_INTEREST = BASE_INTEREST.div(TWO)
    const expMinusOne = exp.minus(ONE)
    const expMinusTwo = exp.gt(TWO) ? exp.minus(TWO) : ZERO
    const basePowerTwo = ratePerSecond
      .times(ratePerSecond)
      .plus(HALF_BASE_INTEREST)
      .div(BASE_INTEREST)
    const basePowerThree = basePowerTwo
      .times(ratePerSecond)
      .plus(HALF_BASE_INTEREST)
      .div(BASE_INTEREST)
    const secondTerm = exp
      .times(expMinusOne)
      .times(basePowerTwo)
      .div(TWO)
    const thirdTerm = exp
      .times(expMinusOne)
      .times(expMinusTwo)
      .times(basePowerThree)
      .div(SIX)
    currentInterestAccumulator = interestAccumulator
      .times(
        BASE_INTEREST.plus(ratePerSecond.times(exp))
          .plus(secondTerm)
          .plus(thirdTerm)
      )
      .div(BASE_INTEREST)
  }
  return normalizedDebt.times(currentInterestAccumulator).div(BASE_PARAMS.times(BASE_TOKENS))
}

export function computeHealthFactor(
  collateral: BigInt,
  collateralBase: BigInt,
  oracleValue: BigInt,
  debt: BigInt,
  collateralFactor: BigInt
): BigInt {
  if (debt.isZero()) {
    // avoid division by zero
    return MAX_UINT256
  }
  return collateral.times(collateralFactor.times(oracleValue)).div(debt.times(collateralBase))
}

export function extractArray(
  thisArg: VaultManager,
  getter: (this: VaultManager, param0: BigInt) => ethereum.CallResult<BigInt>
): BigInt[] {
  let array = new Array<BigInt>()
  for (let i = 0; i < getter.length; i++) {
    let result = getter.call(thisArg, BigInt.fromI32(i))
    if (result.reverted) {
      break
    }
    array.push(result.value)
  }
  return array
}

export function isBurn(event: Transfer): boolean {
  return event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function isMint(event: Transfer): boolean {
  return event.params.from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function _initVaultManager(address: Address, block: ethereum.Block): void {
  const vaultManager = VaultManager.bind(address)
  const collateralContract = ERC20.bind(vaultManager.collateral())

  log.warning('+++++ New VaultManager: {}', [address.toHexString()])
  // Start indexing and tracking new contracts
  VaultManagerTemplate.create(address)

  const id = address.toHexString()
  let data = new VaultManagerData(id)

  // Create data point
  data.vaultManager = address.toHexString()
  data.agToken = vaultManager.stablecoin().toHexString()
  data.collateral = vaultManager.collateral().toHexString()
  data.collateralBase = BigInt.fromI32(10).pow(collateralContract.decimals() as u8)
  data.dust = vaultManager.dust()
  data.treasury = vaultManager.treasury().toHexString()
  data.collateralAmount = collateralContract.balanceOf(address)
  data.interestAccumulator = vaultManager.interestAccumulator()
  data.lastInterestAccumulatorUpdated = vaultManager.lastInterestAccumulatorUpdated()
  // values known at init
  data.activeVaultsCount = BigInt.fromI32(0)
  data.surplus = BigInt.fromI32(0)
  data.badDebt = BigInt.fromI32(0)
  data.profits = BigInt.fromI32(0)
  data.pendingSurplus = BigInt.fromI32(0)
  data.pendingBadDebt = BigInt.fromI32(0)

  data.totalNormalizedDebt = vaultManager.totalNormalizedDebt()
  data.debtCeiling = vaultManager.debtCeiling()
  data.veBoostProxy = vaultManager.veBoostProxy().toHexString()
  data.xLiquidationBoost = extractArray(vaultManager, vaultManager.try_xLiquidationBoost)
  data.yLiquidationBoost = extractArray(vaultManager, vaultManager.try_yLiquidationBoost)
  data.whitelistingActivated = vaultManager.whitelistingActivated()
  data.collateralFactor = vaultManager.collateralFactor()
  data.targetHealthFactor = vaultManager.targetHealthFactor()
  data.borrowFee = vaultManager.borrowFee()
  data.interestRate = vaultManager.interestRate()
  data.liquidationSurcharge = vaultManager.liquidationSurcharge()
  data.maxLiquidationDiscount = vaultManager.maxLiquidationDiscount()
  data.blockNumber = block.number
  data.timestamp = block.timestamp
  data.save()

  // Add historical data point
  _addVaultManagerDataToHistory(data, block)
}

export function _addVaultManagerDataToHistory(data: VaultManagerData, block: ethereum.Block): void {
  const idHistorical = data.id + '_' + historicalSlice(block).toString()
  let dataHistorical = VaultManagerHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new VaultManagerHistoricalData(idHistorical)
  }

  dataHistorical.vaultManager = data.vaultManager
  dataHistorical.agToken = data.agToken
  dataHistorical.collateral = data.collateral
  dataHistorical.collateralBase = data.collateralBase
  dataHistorical.dust = data.dust
  dataHistorical.treasury = data.treasury
  dataHistorical.collateralAmount = data.collateralAmount
  dataHistorical.interestAccumulator = data.interestAccumulator
  dataHistorical.lastInterestAccumulatorUpdated = data.lastInterestAccumulatorUpdated
  dataHistorical.activeVaultsCount = data.activeVaultsCount
  dataHistorical.surplus = data.surplus
  dataHistorical.badDebt = data.badDebt
  dataHistorical.profits = data.profits
  dataHistorical.pendingSurplus = data.pendingSurplus
  dataHistorical.pendingBadDebt = data.pendingBadDebt
  dataHistorical.totalNormalizedDebt = data.totalNormalizedDebt
  dataHistorical.debtCeiling = data.debtCeiling
  dataHistorical.veBoostProxy = data.veBoostProxy
  dataHistorical.xLiquidationBoost = data.xLiquidationBoost
  dataHistorical.yLiquidationBoost = data.yLiquidationBoost
  dataHistorical.whitelistingActivated = data.whitelistingActivated
  dataHistorical.collateralFactor = data.collateralFactor
  dataHistorical.targetHealthFactor = data.targetHealthFactor
  dataHistorical.borrowFee = data.borrowFee
  dataHistorical.interestRate = data.interestRate
  dataHistorical.liquidationSurcharge = data.liquidationSurcharge
  dataHistorical.maxLiquidationDiscount = data.maxLiquidationDiscount
  dataHistorical.blockNumber = data.blockNumber
  dataHistorical.timestamp = data.timestamp
  dataHistorical.save()
}

export function _addVaultDataToHistory(data: VaultData, block: ethereum.Block): void {
  const idHistorical = data.id + '_' + historicalSlice(block).toString()
  let dataHistorical = VaultHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new VaultHistoricalData(idHistorical)
  }

  dataHistorical.vaultManager = data.vaultManager
  dataHistorical.vaultID = data.vaultID
  dataHistorical.owner = data.owner
  dataHistorical.collateralAmount = data.collateralAmount
  dataHistorical.normalizedDebt = data.normalizedDebt
  dataHistorical.isActive = data.isActive
  dataHistorical.debt = data.debt
  dataHistorical.healthFactor = data.healthFactor

  dataHistorical.blockNumber = data.blockNumber
  dataHistorical.timestamp = data.timestamp
  dataHistorical.save()
}

