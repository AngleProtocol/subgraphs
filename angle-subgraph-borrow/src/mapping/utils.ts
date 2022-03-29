import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import { ROUND_COEFF } from '../../../constants'
import { Treasury } from '../../generated/TreasuryTemplate/Treasury'
import { AgToken } from '../../generated/TreasuryTemplate/AgToken'
import { ERC20 } from '../../generated/templates/VaultManagerTemplate/ERC20'
import { VaultManager } from '../../generated/templates/VaultManagerTemplate/VaultManager'
import {
  TreasuryData,
  TreasuryHistoricalData,
  VaultManagerData,
  VaultManagerHistoricalData
} from '../../generated/schema'

import { log } from '@graphprotocol/graph-ts'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

function extractArray(thisArg: VaultManager, getter: (this: VaultManager, param0: BigInt) => ethereum.CallResult<BigInt>): BigInt[]{
  let array = new Array<BigInt>()
  for (let i = 0; i < getter.length; i++) {
    let result = getter.call(thisArg, BigInt.fromI32(i))
    log.warning("lol: {}", [result.reverted.toString()])
    if(result.reverted){
      log.warning('nope', [])
      break;
    }
    log.warning('what', [])
    array.push(result.value)
  }
  log.warning('end', [])
  return array
}

export function _updateTreasury(address: Address, block: ethereum.Block): void {
  const treasury = Treasury.bind(address)
  log.warning('+++++ Update Treasury: {}, {}', [address.toHexString(), treasury.stablecoin().toHexString()])

  // Try to load existing treasury for this agToken, and update it
  const id = address.toHexString()
  const idHistorical = id + block.timestamp.toString()
  let data = TreasuryData.load(id)
  if (data == null) {
    // Start indexing and tracking new contracts if it's a new one
    // TreasuryTemplate.create(event.params._treasury)
    data = new TreasuryData(id)
  } else {
    // Can we tell thegraph to stop monitoring previous treasury contract?
  }

  // Fetch values
  let treasuryAddress = address.toHexString()
  let badDebt = treasury.badDebt()
  let surplusBuffer = treasury.surplusBuffer()
  const agTokenAddress = treasury.stablecoin()
  const agToken = AgToken.bind(agTokenAddress)
  let surplus = agToken.balanceOf(address).minus(data.surplusBuffer)
  let surplusForGovernance = treasury.surplusForGovernance()
  let surplusManager = treasury.surplusManager().toHexString()
  let blockNumber = block.number
  let timestamp = block.timestamp

  // Fill data
  data.treasury = treasuryAddress
  data.agToken = agTokenAddress.toHexString()
  data.badDebt = badDebt
  data.surplusBuffer = surplusBuffer
  data.surplus = surplus
  data.surplusForGovernance = surplusForGovernance
  data.surplusManager = surplusManager

  data.blockNumber = blockNumber
  data.timestamp = timestamp
  data.save()

  // Fill dataHistorical
  let dataHistorical = TreasuryHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new TreasuryHistoricalData(idHistorical)
  }

  dataHistorical.treasury = data.treasury
  dataHistorical.agToken = data.agToken
  dataHistorical.badDebt = data.badDebt
  dataHistorical.surplusBuffer = data.surplusBuffer
  dataHistorical.surplus = data.surplus
  dataHistorical.surplusForGovernance = data.surplusForGovernance
  dataHistorical.surplusManager = data.surplusManager
  dataHistorical.blockNumber = data.blockNumber
  dataHistorical.timestamp = data.timestamp
  dataHistorical.save()
}

export function _addVaultManagerDataToHistory(data: VaultManagerData): void{
  const idHistorical = data.id + data.timestamp.toString()
  let dataHistorical = VaultManagerHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new VaultManagerHistoricalData(idHistorical)
  }

  dataHistorical.vaultManager = data.vaultManager
  dataHistorical.agToken = data.agToken
  dataHistorical.collateral = data.collateral
  dataHistorical.dust = data.dust
  dataHistorical.treasury = data.treasury
  dataHistorical.collateralAmount = data.collateralAmount
  dataHistorical.badDebt = data.badDebt
  dataHistorical.surplus = data.surplus
  dataHistorical.interestAccumulator = data.interestAccumulator
  // value known at init
  dataHistorical.mintingEnabled = true
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

export function _initVaultManager(address: Address, block: ethereum.Block): void {
  const vaultManager = VaultManager.bind(address)
  const collateralContract = ERC20.bind(vaultManager.collateral())

  log.warning('+++++ New VaultManager: {}', [address.toHexString()])

  // Try to load existing vaultmanager for this agToken, and update it
  const id = address.toHexString()
  let data = VaultManagerData.load(id)
  if (data == null) {
    data = new VaultManagerData(id)
  }

  // Create data point
  data.vaultManager = address.toHexString()
  data.agToken = vaultManager.stablecoin().toHexString()
  data.collateral = vaultManager.collateral().toHexString()
  data.dust = vaultManager.dust()
  data.treasury = vaultManager.treasury().toHexString()
  data.collateralAmount = collateralContract.balanceOf(address)
  data.badDebt = vaultManager.badDebt()
  data.surplus = vaultManager.surplus()
  data.interestAccumulator = vaultManager.interestAccumulator()
  // value known at init
  data.mintingEnabled = true
  data.totalNormalizedDebt = vaultManager.totalNormalizedDebt()
  data.debtCeiling = vaultManager.debtCeiling()
  log.warning("is: {}", [vaultManager.xLiquidationBoost.length.toString()])
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
  data.timestamp = historicalSlice(block)
  data.save()

  // Add historical data point
  _addVaultManagerDataToHistory(data)
}
