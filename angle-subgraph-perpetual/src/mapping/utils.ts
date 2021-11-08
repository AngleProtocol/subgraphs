import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERC20 } from '../../generated/templates/StableMasterTemplate/ERC20'
import { SanToken } from '../../generated/templates/StableMasterTemplate/SanToken'
import { AgToken as AgTokenContract } from '../../generated/templates/StableMasterTemplate/AgToken'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { Oracle } from '../../generated/templates/StableMasterTemplate/Oracle'
import { PoolData, StableData, StableHistoricalData, PoolHistoricalData } from '../../generated/schema'
import { ROUND_COEFF } from '../../../constants'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

export function updateStableData(stableMaster: StableMaster, block: ethereum.Block): void {
  const roundedTimestamp = historicalSlice(block)

  const agToken = ERC20.bind(stableMaster.agToken())
  const id = stableMaster._address.toHexString()
  const idHistorical = stableMaster._address.toHexString() + '_hour_' + roundedTimestamp.toString()

  let data = StableData.load(id)
  if (data == null) {
    data = new StableData(id)
  }

  const name = agToken.symbol()
  data.name = name

  const collatRatio = stableMaster.getCollateralRatio()
  data.collatRatio = collatRatio

  const totalMinted = agToken.totalSupply()
  data.totalMinted = totalMinted
  data.blockNumber = block.number
  data.timestamp = block.timestamp

  let dataHistoricalHour = StableHistoricalData.load(idHistorical)
  if (dataHistoricalHour == null) {
    dataHistoricalHour = new StableHistoricalData(idHistorical)
    dataHistoricalHour.name = name
    dataHistoricalHour.tvl = collatRatio.times(totalMinted)
    dataHistoricalHour.collatRatio = collatRatio
    dataHistoricalHour.totalMinted = totalMinted
    dataHistoricalHour.blockNumber = block.number
    dataHistoricalHour.timestamp = block.timestamp
  } else {
    // for the moment we just update with the last value in the hour but we could easier takes the first in the hour
    // or takes the mean (by adding a field to the struct to track the nuber of points so far) or more advanced metrics
    dataHistoricalHour.tvl = collatRatio.times(totalMinted)
    dataHistoricalHour.collatRatio = collatRatio
    dataHistoricalHour.totalMinted = totalMinted
    dataHistoricalHour.timestamp = block.timestamp
  }

  data.save()
  dataHistoricalHour.save()
}

export function _updatePoolData(
  poolManager: PoolManager,
  block: ethereum.Block,
  add: boolean = true,
  margin: BigInt = BigInt.fromString('0')
): PoolData {
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const token = ERC20.bind(poolManager.token())
  const agToken = AgTokenContract.bind(stableMaster.agToken())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)
  const oracle = Oracle.bind(collatData.value3)

  const id = poolManager._address.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistorical = poolManager._address.toHexString() + '_hour_' + roundedTimestamp.toString()

  let totalMargin: BigInt
  let data = PoolData.load(id)
  if (data == null) {
    data = new PoolData(id)
    totalMargin = BigInt.fromString('0')
  }
  totalMargin = add ? data.totalMargin.plus(margin) : data.totalMargin.minus(margin)

  data.poolManager = poolManager._address.toHexString()

  const decimals = BigInt.fromI32(token.decimals())
  data.decimals = decimals

  const stableMasterAddress = poolManager.stableMaster().toHexString()
  data.stableMaster = stableMasterAddress

  const stableName = agToken.symbol()
  data.stableName = stableName

  const collatName = token.symbol()
  data.collatName = collatName

  const totalAsset = poolManager.getTotalAsset()
  data.totalAsset = totalAsset

  const availableAsset = poolManager.getBalance()
  data.availableAsset = availableAsset

  const stockUser = collatData.value4
  data.stockUser = stockUser

  const sanToken = SanToken.bind(collatData.value1)

  const sanRate = collatData.value5
  const stockSLP = sanToken.totalSupply().times(sanRate)
  data.stockSLP = stockSLP

  data.sanRate = sanRate

  const slpInfo = collatData.value7
  const lastBlockUpadted = slpInfo.lastBlockUpdated
  data.lastBlockUpdated = lastBlockUpadted

  const lockedInterests = slpInfo.lockedInterests
  data.lockedInterests = lockedInterests

  const maxInterestsDistributed = slpInfo.maxInterestsDistributed
  data.maxInterestsDistributed = maxInterestsDistributed

  const feesAside = slpInfo.feesAside
  data.feesAside = feesAside

  const feesForSLPs = slpInfo.feesForSLPs
  data.feesForSLPs = feesForSLPs

  const interestsForSLPs = slpInfo.interestsForSLPs
  data.interestsForSLPs = interestsForSLPs

  const apr = poolManager.estimatedAPR()
  data.apr = apr

  const totalHedgeAmount = perpetualManager.totalHedgeAmount()
  data.totalHedgeAmount = totalHedgeAmount

  data.totalMargin = totalMargin

  const rates = oracle.readAll()
  data.rateLower = rates.value0
  data.rateUpper = rates.value1

  const targetHAHedge = perpetualManager.targetHAHedge()
  data.targetHAHedge = targetHAHedge

  const limitHAHedge = perpetualManager.limitHAHedge()
  data.limitHAHedge = limitHAHedge

  const keeperFeesLiquidationCap = perpetualManager.keeperFeesLiquidationCap()
  data.keeperFeesLiquidationCap = keeperFeesLiquidationCap

  const keeperFeesClosingCap = perpetualManager.keeperFeesClosingCap()
  data.keeperFeesClosingCap = keeperFeesClosingCap

  const keeperFeesLiquidationRatio = perpetualManager.keeperFeesLiquidationRatio()
  data.keeperFeesLiquidationRatio = keeperFeesLiquidationRatio

  const maintenanceMargin = perpetualManager.maintenanceMargin()
  data.maintenanceMargin = maintenanceMargin

  data.blockNumber = block.number

  data.timestamp = block.timestamp

  let dataHistorical = PoolHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new PoolHistoricalData(idHistorical)
    dataHistorical.poolManager = poolManager._address.toHexString()
    dataHistorical.decimals = decimals
    dataHistorical.stableMaster = stableMasterAddress
    dataHistorical.stableName = stableName
    dataHistorical.collatName = collatName
    dataHistorical.totalAsset = totalAsset
    dataHistorical.availableAsset = availableAsset
    dataHistorical.stockUser = stockUser
    dataHistorical.stockSLP = stockSLP
    dataHistorical.sanRate = sanRate
    dataHistorical.lastBlockUpdated = lastBlockUpadted
    dataHistorical.lockedInterests = lockedInterests
    dataHistorical.maxInterestsDistributed = maxInterestsDistributed
    dataHistorical.feesAside = feesAside
    dataHistorical.feesForSLPs = feesForSLPs
    dataHistorical.interestsForSLPs = interestsForSLPs
    dataHistorical.apr = apr
    dataHistorical.totalHedgeAmount = totalHedgeAmount
    dataHistorical.totalMargin = totalMargin
    dataHistorical.rateLower = rates.value0
    dataHistorical.rateUpper = rates.value1
    dataHistorical.targetHAHedge = targetHAHedge
    dataHistorical.keeperFeesLiquidationCap = keeperFeesLiquidationCap
    dataHistorical.limitHAHedge = limitHAHedge
    dataHistorical.keeperFeesClosingCap = keeperFeesClosingCap
    dataHistorical.keeperFeesLiquidationRatio = keeperFeesLiquidationRatio
    dataHistorical.maintenanceMargin = maintenanceMargin
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  }
  dataHistorical.save()

  return data
}
