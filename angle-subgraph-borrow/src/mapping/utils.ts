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

export function _updateTreasury(address: Address, block: ethereum.Block): void {
  const treasury = Treasury.bind(address)
  const agTokenAddress = treasury.stablecoin()
  const agToken = AgToken.bind(agTokenAddress)
  log.warning('+++++ Treasury: {}, {}', [address.toHexString(), agTokenAddress.toHexString()])

  // Try to load existing treasury for this agToken, and update it
  const id = agTokenAddress.toHexString()
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
  let surplus = agToken.balanceOf(address).minus(data.surplusBuffer)
  let surplusForGovernance = treasury.surplusForGovernance()
  let surplusManager = treasury.surplusManager().toHexString()
  let blockNumber = block.number
  let timestamp = block.timestamp

  // Fill data
  data.treasury = treasuryAddress
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

  dataHistorical.treasury = treasuryAddress
  dataHistorical.badDebt = badDebt
  dataHistorical.surplusBuffer = surplusBuffer
  dataHistorical.surplus = surplus
  dataHistorical.surplusForGovernance = surplusForGovernance
  dataHistorical.surplusManager = surplusManager

  dataHistorical.blockNumber = blockNumber
  dataHistorical.timestamp = timestamp
  dataHistorical.save()
}

export function _updateVaultManager(address: Address, block: ethereum.Block, debt: BigInt = BigInt.fromI32(0)): void {
  const vaultManager = VaultManager.bind(address)
  const timestamp = historicalSlice(block)
  log.warning('+++++ VaultManager: {}', [address.toHexString()])

  // Try to load existing vaultmanager for this agToken, and update it
  const id = address.toHexString()
  const idHistorical = id + timestamp.toString()
  let data = VaultManagerData.load(id)
  if (data == null) {
    log.warning('/////////// NEW VM', [])
    data = new VaultManagerData(id)
  }

  // Fetch values
  let vaultManagerAddress = address.toHexString()
  let collateral = vaultManager.collateral()
  let agTokenAddress = vaultManager.stablecoin().toHexString()
  const collateralContract = ERC20.bind(collateral)
  let dust = vaultManager.dust()
  let treasury = vaultManager.treasury().toHexString()
  let collateralAmount = collateralContract.balanceOf(address)
  log.warning('======= treasury {}', [treasury])
  let badDebt = vaultManager.badDebt()
  let surplus = vaultManager.surplus()
  let interestAccumulator = vaultManager.interestAccumulator()

  let blockNumber = block.number

  // # Value of interestAccumulator
  // interestAccumulator: BigInt!
  // # Has minting rights
  // mintingEnabled: Boolean!
  // # Is contract paused
  // paused: Boolean!

  // ## Governance parameters
  // # Maximum debt this VaultManager can handle
  // debtCeiling: BigInt!
  // # Liquidation boost parameters
  // liquidationBoostX: [BigInt!]!
  // liquidationBoostY: [BigInt!]!
  // # If whitelisting is enabled
  // whitelisting: Boolean!
  // # Value of collateral factor
  // collateralFactor: BigInt!
  // # Value of target health factor
  // targetHealthFactor: BigInt!
  // # Value of borrow fee
  // borrowFee: BigInt!
  // # Value of borrow interest rate
  // interestRate: BigInt!
  // # Value of liquidation surcharge
  // liquidationSurcharge: BigInt!
  // # Value of max liquidation discount
  // maxLiquidationDiscount: BigInt!

  // ## Time tracking
  // # BlockNumber of last update
  // blockNumber: BigInt!
  // # Timestamp of last update
  // timestamp: BigInt!

  // Fill data
  data.vaultManager = vaultManagerAddress
  data.agToken = agTokenAddress
  data.collateral = collateral.toHexString()
  data.dust = dust
  data.treasury = treasury
  data.collateralAmount = collateralAmount
  data.badDebt = badDebt
  data.surplus = surplus
  data.interestAccumulator = interestAccumulator

  data.blockNumber = blockNumber
  data.timestamp = timestamp

  data.save()

  // // Fill dataHistorical
  // let dataHistorical = VaultManagerHistoricalData.load(idHistorical)
  // if (dataHistorical == null) {
  //   dataHistorical = new VaultManagerHistoricalData(idHistorical)
  // }

  // dataHistorical.vaultmanager = vaultmanagerAddress
  // dataHistorical.badDebt = badDebt
  // dataHistorical.surplusBuffer = surplusBuffer
  // dataHistorical.surplus = surplus
  // dataHistorical.surplusForGovernance = surplusForGovernance
  // dataHistorical.surplusManager = surplusManager

  // dataHistorical.blockNumber = blockNumber
  // dataHistorical.timestamp = timestamp
  // dataHistorical.save()
}
