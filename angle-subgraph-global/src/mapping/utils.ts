import { ethereum, BigInt, log } from '@graphprotocol/graph-ts'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERC20 } from '../../generated/templates/StableMasterTemplate/ERC20'
import { SanToken } from '../../generated/templates/StableMasterTemplate/SanToken'
import { AgToken as AgTokenContract } from '../../generated/templates/StableMasterTemplate/AgToken'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { Oracle, Oracle__readAllResult } from '../../generated/templates/StableMasterTemplate/Oracle'
import { PoolData, StableData, StableHistoricalData, PoolHistoricalData, Perpetual, FeeData, OracleByTicker, FeeHistoricalData, OracleCoreData, OracleAPRCoreHistoricalData } from '../../generated/schema'
import { BASE_PARAMS, BASE_TOKENS, BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR, ROUND_COEFF, ZERO } from '../../../constants'
import { StableMaster__collateralMapResultFeeDataStruct } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { PerpetualOpened } from '../../generated/templates/PerpetualManagerFrontTemplate/PerpetualManagerFront'
import { ChainlinkTemplate } from '../../generated/templates'
import { ChainlinkProxy } from '../../generated/templates/ChainlinkTemplate/ChainlinkProxy'
import { getCollateralPrice } from './chainlink'


export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

// Whitespaces are stripped first. Then, `description` must be in the format "(W)TOKEN1/TOKEN2" or "(W)TOKEN1/TOKEN2Oracle".
export function parseOracleDescription(description: string, hasExtra: boolean): string[] {
  description = description.replace(' ', '')
  if (hasExtra) description = description.slice(0, -6)
  let tokens = description.split('/')
  return tokens
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

  const resultCollatRatio = stableMaster.try_getCollateralRatio()
  if (!resultCollatRatio.reverted) {
    data.collatRatio = resultCollatRatio.value
  }

  const totalMinted = agToken.totalSupply()
  data.totalMinted = totalMinted
  data.blockNumber = block.number
  data.timestamp = block.timestamp

  let dataHistoricalHour = StableHistoricalData.load(idHistorical)
  if (dataHistoricalHour == null) {
    dataHistoricalHour = new StableHistoricalData(idHistorical)
    dataHistoricalHour.name = name
    if (!resultCollatRatio.reverted) {
      dataHistoricalHour.collatRatio = resultCollatRatio.value
    } else {
      dataHistoricalHour.collatRatio = data.collatRatio
    }
    dataHistoricalHour.totalMinted = totalMinted
    dataHistoricalHour.blockNumber = block.number
    dataHistoricalHour.timestamp = block.timestamp
  } else {
    // for the moment we just update with the last value in the hour but we could easier takes the first in the hour
    // or takes the mean (by adding a field to the struct to track the nuber of points so far) or more advanced metrics
    if (!resultCollatRatio.reverted) {
      dataHistoricalHour.collatRatio = resultCollatRatio.value
    } else {
      dataHistoricalHour.collatRatio = data.collatRatio
    }
    dataHistoricalHour.totalMinted = totalMinted
    dataHistoricalHour.timestamp = block.timestamp
  }

  data.save()
  dataHistoricalHour.save()
}

export function _updateGainPoolData(
  poolManager: PoolManager,
  block: ethereum.Block,
  totalProtocolFees: BigInt = BigInt.fromString('0'),
  totalKeeperFees: BigInt = BigInt.fromString('0'),
  totalSLPFees: BigInt = BigInt.fromString('0'),
  totalProtocolInterests: BigInt = BigInt.fromString('0'),
  totalSLPInterests: BigInt = BigInt.fromString('0')
): void {
  const id = poolManager._address.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistorical = poolManager._address.toHexString() + '_hour_' + roundedTimestamp.toString()
  const token = ERC20.bind(poolManager.token())

  // always call after _updatePoolData
  let data = PoolData.load(id)!
  let dataHistorical = PoolHistoricalData.load(idHistorical)!

  let tmpTotalProtocolFees = data.totalProtocolFees.plus(totalProtocolFees)
  let tmpTotalKeeperFees = data.totalKeeperFees.plus(totalKeeperFees)
  let tmpTotalSLPFees = data.totalSLPFees.plus(totalSLPFees)
  let tmpTotalProtocolInterests = data.totalProtocolInterests.plus(totalProtocolInterests)
  let tmpTotalSLPInterests = data.totalSLPInterests.plus(totalSLPInterests)

  data.totalProtocolFees = tmpTotalProtocolFees
  data.totalKeeperFees = tmpTotalKeeperFees
  data.totalSLPFees = tmpTotalSLPFees
  data.totalProtocolInterests = tmpTotalProtocolInterests
  data.totalSLPInterests = tmpTotalSLPInterests

  dataHistorical.totalProtocolFees = tmpTotalProtocolFees
  dataHistorical.totalKeeperFees = tmpTotalKeeperFees
  dataHistorical.totalSLPFees = tmpTotalSLPFees
  dataHistorical.totalProtocolInterests = tmpTotalProtocolInterests
  dataHistorical.totalSLPInterests = tmpTotalSLPInterests

  dataHistorical.save()
  data.save()

  // Update the global revenue values
  const feeData = FeeData.load('0')!
  let feeDataHistorical = FeeHistoricalData.load(roundedTimestamp.toString())
  if (feeDataHistorical == null) {
    feeDataHistorical = new FeeHistoricalData(roundedTimestamp.toString())
  }
  const collatName = token.symbol()
  const collateralOracle = OracleByTicker.load(collatName)
  const decimalNormalizer = BigInt.fromString('10').pow(data.decimals!.toI32() as u8)
  let collateralPrice: BigInt
  if (collateralOracle == null) {
    if (collatName == "USDC") {
      collateralPrice = BASE_TOKENS
    } else {
      log.warning('=== we have to read the oracle from contract: {}', [collatName])
      const stableMaster = StableMaster.bind(poolManager.stableMaster())
      const collatData = stableMaster.collateralMap(poolManager._address)
      const oracle = Oracle.bind(collatData.value3)
      collateralPrice = oracle.readLower()
    }
  }
  else collateralPrice = getCollateralPrice(collateralOracle)


  tmpTotalProtocolFees = feeData.totalProtocolFees.plus(totalProtocolFees.times(collateralPrice).div(decimalNormalizer))
  tmpTotalKeeperFees = feeData.totalKeeperFees.plus(totalKeeperFees.times(collateralPrice).div(decimalNormalizer))
  tmpTotalSLPFees = feeData.totalSLPFees.plus(totalSLPFees.times(collateralPrice).div(decimalNormalizer))
  tmpTotalProtocolInterests = feeData.totalProtocolInterests.plus(totalProtocolInterests.times(collateralPrice).div(decimalNormalizer))
  tmpTotalSLPInterests = feeData.totalSLPInterests.plus(totalSLPInterests.times(collateralPrice).div(decimalNormalizer))

  feeData.totalProtocolFees = tmpTotalProtocolFees
  feeData.totalKeeperFees = tmpTotalKeeperFees
  feeData.totalSLPFees = tmpTotalSLPFees
  feeData.totalProtocolInterests = tmpTotalProtocolInterests
  feeData.totalSLPInterests = tmpTotalSLPInterests
  feeData.blockNumber = block.number
  feeData.timestamp = block.timestamp

  feeDataHistorical.totalProtocolFees = tmpTotalProtocolFees
  feeDataHistorical.totalKeeperFees = tmpTotalKeeperFees
  feeDataHistorical.totalSLPFees = tmpTotalSLPFees
  feeDataHistorical.totalProtocolInterests = tmpTotalProtocolInterests
  feeDataHistorical.totalSLPInterests = tmpTotalSLPInterests
  feeDataHistorical.timestamp = block.timestamp
  feeDataHistorical.blockNumber = block.number

  feeData.save()
  feeDataHistorical.save()

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

  const decimals = BigInt.fromI32(token.decimals())
  const totalHedgeAmount = perpetualManager.totalHedgeAmount()

  let totalMargin: BigInt

  let data = PoolData.load(id)
  if (data == null) {
    data = new PoolData(id)
    totalMargin = ZERO
    _trackNewChainlinkOracle(oracle);
  }

  totalMargin = add ? data.totalMargin.plus(margin) : data.totalMargin.minus(margin)

  data.poolManager = poolManager._address.toHexString()

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

  const resultInterestsForSurplus = poolManager.try_interestsForSurplus()
  let interestsForSurplus = BigInt.fromString('0')
  if (!resultInterestsForSurplus.reverted) {
    interestsForSurplus = resultInterestsForSurplus.value
    data.interestsForSurplus = interestsForSurplus
  }

  let interestsForSLPs: BigInt
  let apr: BigInt
  const result = poolManager.try_interestsForSurplus()
  if (result.reverted || block.number.gt(BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR)) {
    interestsForSLPs = slpInfo.interestsForSLPs
    const resultAPR = poolManager.try_estimatedAPR()
    apr = resultAPR.reverted ? BigInt.fromString('0') : resultAPR.value
  } else {
    const interestForSurplus = result.value
    const resultAPR = poolManager.try_estimatedAPR()
    interestsForSLPs = slpInfo.interestsForSLPs.times(BASE_PARAMS.minus(interestForSurplus)).div(BASE_PARAMS)
    apr = resultAPR.reverted
      ? BigInt.fromString('0')
      : resultAPR.value.times(BASE_PARAMS.minus(interestForSurplus)).div(BASE_PARAMS)
  }

  data.interestsForSLPs = interestsForSLPs

  // if the call did not fail
  if (!apr.equals(BigInt.fromString('0'))) {
    data.apr = apr
  }

  data.totalHedgeAmount = totalHedgeAmount

  data.totalMargin = totalMargin

  const resultRates = oracle.try_readAll()
  let rates: Oracle__readAllResult
  if (resultRates.reverted) {
    const rateLower = data.rateLower ? data.rateLower : BigInt.fromString('0')
    const rateUpper = data.rateUpper ? data.rateUpper : BigInt.fromString('0')
    rates = new Oracle__readAllResult(rateLower!, rateUpper!)
  } else {
    rates = resultRates.value
  }

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
  }
  dataHistorical.totalAsset = totalAsset
  dataHistorical.availableAsset = availableAsset
  dataHistorical.stockUser = stockUser
  dataHistorical.stockSLP = stockSLP
  dataHistorical.sanRate = sanRate
  dataHistorical.lastBlockUpdated = lastBlockUpadted
  dataHistorical.lockedInterests = lockedInterests
  dataHistorical.maxInterestsDistributed = maxInterestsDistributed
  dataHistorical.totalProtocolFees = data.totalProtocolFees
  dataHistorical.totalKeeperFees = data.totalKeeperFees
  dataHistorical.totalSLPFees = data.totalSLPFees
  dataHistorical.totalProtocolInterests = data.totalProtocolInterests
  dataHistorical.totalSLPInterests = data.totalSLPInterests
  dataHistorical.feesAside = feesAside
  dataHistorical.feesForSLPs = feesForSLPs
  dataHistorical.interestsForSurplus = interestsForSurplus
  dataHistorical.interestsForSLPs = interestsForSLPs
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
  if (!apr.equals(BigInt.fromString('0'))) {
    dataHistorical.apr = apr
  }

  dataHistorical.save()

  return data
}

/// @notice Update a pool manager oracle datas and APR
export function updateOracleData(poolManager: PoolManager, block: ethereum.Block): void {
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const token = ERC20.bind(poolManager.token())
  const agToken = ERC20.bind(stableMaster.agToken())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const oracle = Oracle.bind(collatData.value3)
  const stableName = agToken.symbol()
  const collatName = token.symbol()
  const resultRates = oracle.try_readAll()
  const result = poolManager.try_interestsForSurplus()
  let apr: BigInt
  if (result.reverted || block.number.gt(BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR)) {
    const resultAPR = poolManager.try_estimatedAPR()
    apr = resultAPR.reverted ? BigInt.fromString('0') : resultAPR.value
  } else {
    const interestForSurplus = result.value
    const resultAPR = poolManager.try_estimatedAPR()
    apr = resultAPR.reverted
      ? BigInt.fromString('0')
      : resultAPR.value.times(BASE_PARAMS.minus(interestForSurplus)).div(BASE_PARAMS)
  }

  // Better to set the id to the poolManager than the oracle as there is more chances that the oracle is updated
  const id = poolManager._address.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistorical = oracle._address.toHexString() + '_' + roundedTimestamp.toString()

  let data = OracleCoreData.load(id)
  if (data == null) {
    data = new OracleCoreData(id)
  }
  let rates: Oracle__readAllResult
  if (resultRates.reverted) {
    rates = new Oracle__readAllResult(data.rateLower, data.rateUpper)
  } else {
    rates = resultRates.value
  }

  data.oracle = oracle._address.toHexString()
  data.tokenOut = stableName
  data.tokenIn = collatName
  data.rateLower = rates.value0
  data.rateUpper = rates.value1
  data.blockNumber = block.number
  data.timestamp = block.timestamp

  let dataOracleAprHistoricalHour = OracleAPRCoreHistoricalData.load(idHistorical)
  if (dataOracleAprHistoricalHour == null) {
    dataOracleAprHistoricalHour = new OracleAPRCoreHistoricalData(idHistorical)
    dataOracleAprHistoricalHour.collatName = token.symbol()
    dataOracleAprHistoricalHour.stableName = agToken.symbol()
    dataOracleAprHistoricalHour.rateLower = rates.value0
    dataOracleAprHistoricalHour.rateUpper = rates.value1
    dataOracleAprHistoricalHour.timestamp = roundedTimestamp
    dataOracleAprHistoricalHour.blockNumber = block.number
    // if the call didn't failed then update the value
    if (!apr.equals(BigInt.fromString('0'))) {
      dataOracleAprHistoricalHour.apr = apr
    }
  } else {
    // for the moment we just update with the last value in the hour but we could easier takes the first in the hour
    // or takes the mean (by adding a field to the struct to track the nuber of points so far) or more advanced metrics
    dataOracleAprHistoricalHour.collatName = token.symbol()
    dataOracleAprHistoricalHour.stableName = agToken.symbol()
    dataOracleAprHistoricalHour.rateLower = rates.value0
    dataOracleAprHistoricalHour.rateUpper = rates.value1
    dataOracleAprHistoricalHour.timestamp = roundedTimestamp
    dataOracleAprHistoricalHour.blockNumber = block.number
    // if the call didn't failed then update the value
    if (!apr.equals(BigInt.fromString('0'))) {
      dataOracleAprHistoricalHour.apr = apr
    }
  }

  data.save()
  dataOracleAprHistoricalHour.save()
}


export function _piecewiseLinear(value: BigInt, xArray: BigInt[], yArray: BigInt[]): BigInt {
  if (value.ge(xArray[xArray.length - 1])) {
    return yArray[yArray.length - 1]
  }
  if (value.le(xArray[0])) {
    return yArray[0]
  }

  let i = 0
  while (value.ge(xArray[i + 1])) {
    i += 1
  }
  const pct = value
    .minus(xArray[i])
    .times(BASE_PARAMS)
    .div(xArray[i + 1].minus(xArray[i]))
  const normalized = pct
    .times(yArray[i + 1].minus(yArray[i]))
    .div(BASE_PARAMS)
    .plus(yArray[i])

  return normalized
}

export function _computeHedgeRatio(
  perpetualManager: PerpetualManagerFront,
  stocksUsers: BigInt,
  currentHedgeAmount: BigInt
): BigInt {
  const targetHAHedge = perpetualManager.targetHAHedge()
  // Fetching info from the `StableMaster`: the amount to hedge is based on the `stocksUsers`
  // of the given collateral
  const targetHedgeAmount = stocksUsers.times(targetHAHedge).div(BASE_PARAMS)

  let ratio: BigInt
  if (currentHedgeAmount.lt(targetHedgeAmount)) ratio = currentHedgeAmount.times(BASE_PARAMS).div(targetHedgeAmount)
  else ratio = BASE_PARAMS

  return ratio
}

export function _getFeesOpenPerp(
  perpetualManager: PerpetualManagerFront,
  poolManager: PoolManager,
  event: PerpetualOpened
): BigInt {
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const stocksUsers = collatData.value4
  const baseCollat = collatData.value6
  const totalHedgeAmount = perpetualManager.totalHedgeAmount()
  const totalHedgeAmountUpdate = event.params._committedAmount.times(event.params._entryRate).div(baseCollat)

  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers, totalHedgeAmount.plus(totalHedgeAmountUpdate))
  const haFeesDeposit = _getDepositFees(perpetualManager, hedgeRatio)
  // Fees are rounded to the advantage of the protocol
  const fee = event.params._committedAmount.times(haFeesDeposit).div(BASE_PARAMS)
  return fee
}

export function _getCashOutAmount(perp: Perpetual, currentRate: BigInt): BigInt {
  // All these computations are made just because we are working with uint and not int
  // so we cannot do x-y if x<y
  const newCommit = perp.committedAmount.times(perp.entryRate).div(currentRate)
  // Checking if a liquidation is needed: for this to happen the `cashOutAmount` should be inferior
  // to the maintenance margin of the perpetual
  let cashOutAmount: BigInt
  if (newCommit.ge(perp.committedAmount.plus(perp.margin))) cashOutAmount = BigInt.fromString('0')
  else {
    // The definition of the margin ratio is `(margin + PnL) / committedAmount`
    // where `PnL = commit * (1-entryRate/currentRate)`
    // So here: `newCashOutAmount = margin + PnL`
    cashOutAmount = perp.committedAmount.plus(perp.margin).minus(newCommit)
  }
  return cashOutAmount
}

export function _getFeesClosePerp(perpetualManager: PerpetualManagerFront, perp: Perpetual): BigInt {
  const oracle = Oracle.bind(perpetualManager.oracle())
  const currentRate = oracle.readLower()
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const stocksUsers = collatData.value4
  const totalHedgeAmount = perpetualManager.totalHedgeAmount()
  const cashOutAmount = _getCashOutAmount(perp, currentRate)
  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers, totalHedgeAmount)

  const feeWithdraw = _getWithdrawFees(perpetualManager, hedgeRatio)
  // Rounding the fees at the protocol's advantage
  let feesPaid = perp.committedAmount.times(feeWithdraw).div(BASE_PARAMS)
  if (feesPaid.ge(cashOutAmount)) {
    feesPaid = cashOutAmount
  }
  return feesPaid
}

export function _getFeesLiquidationPerp(perpetualManager: PerpetualManagerFront, perp: Perpetual): BigInt[] {
  const oracle = Oracle.bind(perpetualManager.oracle())
  const currentRate = oracle.readLower()
  const cashOutAmount = _getCashOutAmount(perp, currentRate)
  const keeperFeesLiquidationRatio = perpetualManager.keeperFeesLiquidationRatio()
  const keeperFeesLiquidationCap = perpetualManager.keeperFeesLiquidationCap()

  let keeperFees = cashOutAmount.times(keeperFeesLiquidationRatio).div(BASE_PARAMS)
  keeperFees = keeperFees.lt(keeperFeesLiquidationCap) ? keeperFees : keeperFeesLiquidationCap
  const protocolFees = cashOutAmount.minus(keeperFees)
  return [protocolFees, keeperFees]
}

export function _getMintFee(stableMaster: StableMaster, poolManager: PoolManager, amount: BigInt): BigInt[] {
  const collatData = stableMaster.collateralMap(poolManager._address)
  const oracle = Oracle.bind(collatData.value3)
  const feeData = collatData.value8
  const stocksUsers = collatData.value4
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)
  const totalHedgeAmount = perpetualManager.totalHedgeAmount()
  const amountForUserInStable = oracle.readQuoteLower(amount)
  const hedgeRatio = _computeHedgeRatio(perpetualManager, amountForUserInStable.plus(stocksUsers), totalHedgeAmount)
  // Fees could in some occasions depend on other factors like collateral ratio
  // Keepers are the ones updating this part of the fees
  const feeMint = _getMintPercentageFees(feeData, hedgeRatio)
  const fee = amount.times(feeMint).div(BASE_PARAMS)
  const percentFeesForSLPs = collatData.value7.feesForSLPs
  const SLPFees = fee.times(percentFeesForSLPs).div(BASE_PARAMS)
  return [fee.minus(SLPFees), SLPFees]
}

export function _getBurnFee(stableMaster: StableMaster, poolManager: PoolManager, amount: BigInt): BigInt[] {
  const collatData = stableMaster.collateralMap(poolManager._address)
  const oracle = Oracle.bind(collatData.value3)
  const feeData = collatData.value8
  const stocksUsers = collatData.value4
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)
  const totalHedgeAmount = perpetualManager.totalHedgeAmount()
  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers.minus(amount), totalHedgeAmount)

  // Getting the highest possible oracle value
  const oracleValue = oracle.readUpper()

  // Computing how much of collateral can be redeemed by the user after taking fees
  // The value of the fees here is `_computeFeeBurn(amount,col)` (it is a proportion expressed in `BASE_PARAMS`)
  // The real value of what can be redeemed by the user is `amountInC * (BASE_PARAMS - fees) / BASE_PARAMS`,
  // but we prefer to avoid doing multiplications after divisions
  const fee = amount
    .times(_getBurnPercentageFees(feeData, hedgeRatio))
    .times(collatData.value6)
    .div(oracleValue.times(BASE_PARAMS))

  const percentFeesForSLPs = collatData.value7.feesForSLPs
  const SLPFees = fee.times(percentFeesForSLPs).div(BASE_PARAMS)
  return [fee.minus(SLPFees), SLPFees]
}

export function _getMintPercentageFees(
  feeData: StableMaster__collateralMapResultFeeDataStruct,
  hedgeRatio: BigInt
): BigInt {
  const bonusMalusMint = feeData.bonusMalusMint
  const xFeeMint = feeData.xFeeMint
  const yFeeMint = feeData.yFeeMint
  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = bonusMalusMint.times(_piecewiseLinear(hedgeRatio, xFeeMint, yFeeMint)).div(BASE_PARAMS)
  return feesPaid
}

export function _getBurnPercentageFees(
  feeData: StableMaster__collateralMapResultFeeDataStruct,
  hedgeRatio: BigInt
): BigInt {
  const bonusMalusBurn = feeData.bonusMalusBurn
  const xFeeBurn = feeData.xFeeBurn
  const yFeeBurn = feeData.yFeeBurn
  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = bonusMalusBurn.times(_piecewiseLinear(hedgeRatio, xFeeBurn, yFeeBurn)).div(BASE_PARAMS)
  return feesPaid
}

export function _getDepositFees(perpetualManager: PerpetualManagerFront, hedgeRatio: BigInt): BigInt {
  const haBonusMalusDeposit = perpetualManager.haBonusMalusDeposit()

  const xHAFeesDeposit: BigInt[] = []
  const yHAFeesDeposit: BigInt[] = []

  let i = 0
  let find = true
  while (find) {
    const result = perpetualManager.try_xHAFeesDeposit(BigInt.fromString(i.toString()))
    if (result.reverted) {
      find = false
    } else {
      xHAFeesDeposit.push(result.value)
      yHAFeesDeposit.push(perpetualManager.yHAFeesDeposit(BigInt.fromString(i.toString())))
      i = i + 1
    }
  }
  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = haBonusMalusDeposit
    .times(_piecewiseLinear(hedgeRatio, xHAFeesDeposit, yHAFeesDeposit))
    .div(BASE_PARAMS)

  return feesPaid
}

export function _getWithdrawFees(perpetualManager: PerpetualManagerFront, hedgeRatio: BigInt): BigInt {
  const haBonusMalusWithdraw = perpetualManager.haBonusMalusWithdraw()

  const xHAFeesWithdraw: BigInt[] = []
  const yHAFeesWithdraw: BigInt[] = []

  let i = 0
  let find = true
  while (find) {
    const result = perpetualManager.try_xHAFeesWithdraw(BigInt.fromString(i.toString()))
    if (result.reverted) {
      find = false
    } else {
      xHAFeesWithdraw.push(result.value)
      yHAFeesWithdraw.push(perpetualManager.yHAFeesWithdraw(BigInt.fromString(i.toString())))
      i = i + 1
    }
  }

  const feesPaid = haBonusMalusWithdraw
    .times(_piecewiseLinear(hedgeRatio, xHAFeesWithdraw, yHAFeesWithdraw))
    .div(BASE_PARAMS)

  return feesPaid
}

export function _getForceCloseFees(
  perpetualManager: PerpetualManagerFront,
  hedgeRatio: BigInt,
  closeFee: BigInt
): BigInt[] {
  const keeperFeesClosingCap = perpetualManager.keeperFeesClosingCap()
  const xKeeperFeesClosing: BigInt[] = []
  const yKeeperFeesClosing: BigInt[] = []

  let i = 0
  let find = true
  while (find) {
    const result = perpetualManager.try_xKeeperFeesClosing(BigInt.fromString(i.toString()))
    if (result.reverted) {
      find = false
    } else {
      xKeeperFeesClosing.push(result.value)
      yKeeperFeesClosing.push(perpetualManager.yKeeperFeesClosing(BigInt.fromString(i.toString())))
      i = i + 1
    }
  }

  let keeperFees = closeFee.times(_piecewiseLinear(hedgeRatio, xKeeperFeesClosing, yKeeperFeesClosing)).div(BASE_PARAMS)
  keeperFees = keeperFees.lt(keeperFeesClosingCap) ? keeperFees : keeperFeesClosingCap
  const protocolFees = closeFee.minus(keeperFees)

  return [protocolFees, keeperFees]
}


export function _trackNewChainlinkOracle(oracle: Oracle): void {
  // check all 
  let i = 0
  let find = true
  while (find) {
    const result = oracle.try_circuitChainlink(BigInt.fromString(i.toString()))
    if (result.reverted) {
      find = false
    } else {
      i = i + 1
      const oracleProxyAddress = result.value
      const proxy = ChainlinkProxy.bind(oracleProxyAddress)
      ChainlinkTemplate.create(proxy.aggregator())
    }
  }
}