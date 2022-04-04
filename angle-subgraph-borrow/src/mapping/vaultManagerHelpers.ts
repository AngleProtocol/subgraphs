import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import { ERC20 } from '../../generated/templates/VaultManagerTemplate/ERC20'
import { VaultManager, Transfer } from '../../generated/templates/VaultManagerTemplate/VaultManager'
import { VaultManagerTemplate } from '../../generated/templates'
import { VaultManagerData, VaultManagerHistoricalData, VaultData, VaultHistoricalData } from '../../generated/schema'
import { historicalSlice } from './utils'

import { log } from '@graphprotocol/graph-ts'

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
  // value known at init
  data.activeVaultsCount = BigInt.fromI32(0)
  // value known at init
  data.surplus = BigInt.fromI32(0)
  // value known at init
  data.badDebt = BigInt.fromI32(0)
  // value known at init
  data.profits = BigInt.fromI32(0)
  data.totalNormalizedDebt = vaultManager.totalNormalizedDebt()
  data.debtCeiling = vaultManager.debtCeiling()
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
  dataHistorical.totalNormalizedDebt = data.totalNormalizedDebt
  dataHistorical.debtCeiling = data.debtCeiling
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
