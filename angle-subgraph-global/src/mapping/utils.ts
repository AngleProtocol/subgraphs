import { Address, ethereum, BigInt, log, BigDecimal } from '@graphprotocol/graph-ts'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERC20 } from '../../generated/templates/StableMasterTemplate/ERC20'
import { SanToken } from '../../generated/templates/StableMasterTemplate/SanToken'
import { AgToken as AgTokenContract } from '../../generated/templates/StableMasterTemplate/AgToken'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { Oracle, Oracle__readAllResult } from '../../generated/templates/StableMasterTemplate/Oracle'
import { PoolData, StableData, StableHistoricalData, PoolHistoricalData, Perpetual, FeeData, OracleData, OracleByTicker, FeeHistoricalData, OracleCoreData, OracleAPRCoreHistoricalData, Token } from '../../generated/schema'
import { BASE_TOKENS, BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR, ROUND_COEFF, ZERO, STETH_ADDRESS, DECIMAL_PARAMS, ZERO_BD, ONE_BD, DECIMAL_TOKENS } from '../../../constants'
import { StableMaster__collateralMapResultFeeDataStruct } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { PerpetualOpened } from '../../generated/templates/PerpetualManagerFrontTemplate/PerpetualManagerFront'
import { ChainlinkTemplate } from '../../generated/templates'
import { ChainlinkProxy } from '../../generated/templates/ChainlinkTemplate/ChainlinkProxy'
import { getCollateralPrice } from './chainlink'
import { stETH } from '../../generated/Chainlink5/stETH'
import { ChainlinkFeed } from '../../generated/templates/ChainlinkTemplate/ChainlinkFeed'
import { convertTokenListToDecimal, convertTokenToDecimal } from '../utils'


let wrappedTokens = new Map<string, string>()
wrappedTokens.set('WBTC', 'BTC')
wrappedTokens.set('wETH', 'ETH')

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
  // if token is wrapped, we're looking for underlying token
  if (wrappedTokens.has(tokens[0])) {
    tokens[0] = wrappedTokens.get(tokens[0])
  }
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
    data.collatRatio = convertTokenToDecimal(resultCollatRatio.value, DECIMAL_PARAMS)
  }

  const totalMinted = agToken.totalSupply()
  const agTokenInfo = getToken(agToken._address)
  data.totalMinted = convertTokenToDecimal(totalMinted, agTokenInfo.decimals)
  data.blockNumber = block.number
  data.timestamp = block.timestamp

  let dataHistoricalHour = StableHistoricalData.load(idHistorical)
  if (dataHistoricalHour == null) {
    dataHistoricalHour = new StableHistoricalData(idHistorical)
    dataHistoricalHour.name = name
    if (!resultCollatRatio.reverted) {
      dataHistoricalHour.collatRatio = convertTokenToDecimal(resultCollatRatio.value, DECIMAL_PARAMS)
    } else {
      dataHistoricalHour.collatRatio = data.collatRatio
    }
    dataHistoricalHour.totalMinted = convertTokenToDecimal(totalMinted, agTokenInfo.decimals)
    dataHistoricalHour.blockNumber = block.number
    dataHistoricalHour.timestamp = block.timestamp
  } else {
    // for the moment we just update with the last value in the hour but we could easier takes the first in the hour
    // or takes the mean (by adding a field to the struct to track the nuber of points so far) or more advanced metrics
    if (!resultCollatRatio.reverted) {
      dataHistoricalHour.collatRatio = convertTokenToDecimal(resultCollatRatio.value, DECIMAL_PARAMS)
    } else {
      dataHistoricalHour.collatRatio = data.collatRatio
    }
    dataHistoricalHour.totalMinted = convertTokenToDecimal(totalMinted, agTokenInfo.decimals)
    dataHistoricalHour.timestamp = block.timestamp
  }

  data.save()
  dataHistoricalHour.save()
}

export function _updateGainPoolData(
  poolManager: PoolManager,
  block: ethereum.Block,
  totalProtocolFees: BigDecimal = ZERO_BD,
  totalKeeperFees: BigDecimal = ZERO_BD,
  totalSLPFees: BigDecimal = ZERO_BD,
  totalProtocolInterests: BigDecimal = ZERO_BD,
  totalSLPInterests: BigDecimal = ZERO_BD
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
  let collateralPrice: BigDecimal
  if (collateralOracle == null) {
    if (collatName == "USDC") {
      collateralPrice = ONE_BD
    } else {
      log.warning('=== we have to read the oracle from contract: {}', [collatName])
      const stableMaster = StableMaster.bind(poolManager.stableMaster())
      const collatData = stableMaster.collateralMap(poolManager._address)
      const oracle = Oracle.bind(collatData.value3)
      collateralPrice = convertTokenToDecimal(oracle.readLower(), DECIMAL_TOKENS)
    }
  }
  else collateralPrice = getCollateralPrice(collateralOracle)


  tmpTotalProtocolFees = feeData.totalProtocolFees.plus(totalProtocolFees.times(collateralPrice))
  tmpTotalKeeperFees = feeData.totalKeeperFees.plus(totalKeeperFees.times(collateralPrice))
  tmpTotalSLPFees = feeData.totalSLPFees.plus(totalSLPFees.times(collateralPrice))
  tmpTotalProtocolInterests = feeData.totalProtocolInterests.plus(totalProtocolInterests.times(collateralPrice))
  tmpTotalSLPInterests = feeData.totalSLPInterests.plus(totalSLPInterests.times(collateralPrice))

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
  margin: BigDecimal = ZERO_BD
): PoolData {
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const token = ERC20.bind(poolManager.token())
  const agToken = AgTokenContract.bind(stableMaster.agToken())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)
  const oracle = Oracle.bind(collatData.value3)
  const collateralInfo = getToken(token._address)
  const stablecoinInfo = getToken(agToken._address)

  const id = poolManager._address.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistorical = poolManager._address.toHexString() + '_hour_' + roundedTimestamp.toString()

  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), stablecoinInfo.decimals)

  let totalMargin: BigDecimal

  let data = PoolData.load(id)
  if (data == null) {
    data = new PoolData(id)
    totalMargin = ZERO_BD
    _trackNewChainlinkOracle(oracle, block.timestamp);
  }

  totalMargin = add ? data.totalMargin.plus(margin) : data.totalMargin.minus(margin)

  data.poolManager = poolManager._address.toHexString()

  data.decimals = collateralInfo.decimals

  const stableMasterAddress = poolManager.stableMaster().toHexString()
  data.stableMaster = stableMasterAddress

  const stableName = agToken.symbol()
  data.stableName = stableName
  data.stablecoin = agToken._address.toHexString()

  const collatName = token.symbol()
  data.collatName = collatName
  data.collateral = token._address.toHexString()

  const totalAsset = convertTokenToDecimal(poolManager.getTotalAsset(), collateralInfo.decimals)
  data.totalAsset = totalAsset

  const availableAsset = convertTokenToDecimal(poolManager.getBalance(), collateralInfo.decimals)
  data.availableAsset = availableAsset

  const stockUser = convertTokenToDecimal(collatData.value4, stablecoinInfo.decimals)
  data.stockUser = stockUser

  const sanToken = SanToken.bind(collatData.value1)

  const sanRate = convertTokenToDecimal(collatData.value5, DECIMAL_TOKENS)
  const stockSLP = convertTokenToDecimal(sanToken.totalSupply(), collateralInfo.decimals).times(sanRate)
  data.stockSLP = stockSLP

  data.sanRate = sanRate

  const slpInfo = collatData.value7
  const lastBlockUpadted = slpInfo.lastBlockUpdated
  data.lastBlockUpdated = lastBlockUpadted

  const lockedInterests = convertTokenToDecimal(slpInfo.lockedInterests, collateralInfo.decimals)
  data.lockedInterests = lockedInterests

  const maxInterestsDistributed = convertTokenToDecimal(slpInfo.maxInterestsDistributed, collateralInfo.decimals)
  data.maxInterestsDistributed = maxInterestsDistributed

  const feesAside = convertTokenToDecimal(slpInfo.feesAside, collateralInfo.decimals)
  data.feesAside = feesAside

  const feesForSLPs = convertTokenToDecimal(slpInfo.feesForSLPs, DECIMAL_PARAMS)
  data.feesForSLPs = feesForSLPs

  const resultInterestsForSurplus = poolManager.try_interestsForSurplus()
  let interestsForSurplus = ZERO_BD
  if (!resultInterestsForSurplus.reverted) {
    interestsForSurplus = convertTokenToDecimal(resultInterestsForSurplus.value, DECIMAL_PARAMS)
    data.interestsForSurplus = interestsForSurplus
  }

  let interestsForSLPs: BigDecimal
  let apr: BigDecimal
  if (resultInterestsForSurplus.reverted || block.number.gt(BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR)) {
    interestsForSLPs = convertTokenToDecimal(slpInfo.interestsForSLPs, DECIMAL_PARAMS)
    const resultAPR = poolManager.try_estimatedAPR()
    apr = resultAPR.reverted ? ZERO_BD : convertTokenToDecimal(resultAPR.value, DECIMAL_TOKENS)
  } else {
    const interestForSurplus = interestsForSurplus
    const resultAPR = poolManager.try_estimatedAPR()
    interestsForSLPs = convertTokenToDecimal(slpInfo.interestsForSLPs, DECIMAL_PARAMS).times(ONE_BD.minus(interestForSurplus))
    apr = resultAPR.reverted
      ? ZERO_BD
      : convertTokenToDecimal(resultAPR.value, DECIMAL_TOKENS).times(ONE_BD.minus(interestForSurplus))
  }

  data.interestsForSLPs = interestsForSLPs

  // if the call did not fail
  if (!apr.equals(ZERO_BD)) {
    data.apr = apr
  }

  data.totalHedgeAmount = totalHedgeAmount

  data.totalMargin = totalMargin

  const resultRates = oracle.try_readAll()
  let rates: BigDecimal[]
  if (resultRates.reverted) {
    const rateLower = data.rateLower ? data.rateLower : ZERO_BD
    const rateUpper = data.rateUpper ? data.rateUpper : ZERO_BD
    rates = [rateLower!, rateUpper!]
  } else {
    rates = [convertTokenToDecimal(resultRates.value.value0, DECIMAL_TOKENS), convertTokenToDecimal(resultRates.value.value1, DECIMAL_TOKENS)]
  }

  data.rateLower = rates[0]
  data.rateUpper = rates[1]

  data.blockNumber = block.number
  data.timestamp = block.timestamp

  let dataHistorical = PoolHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new PoolHistoricalData(idHistorical)
    dataHistorical.poolManager = poolManager._address.toHexString()
    dataHistorical.decimals = collateralInfo.decimals
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
  dataHistorical.rateLower = rates[0]
  dataHistorical.rateUpper = rates[1]
  dataHistorical.targetHAHedge = data.targetHAHedge
  dataHistorical.keeperFeesLiquidationCap = data.keeperFeesLiquidationCap
  dataHistorical.limitHAHedge = data.limitHAHedge
  dataHistorical.keeperFeesClosingCap = data.keeperFeesClosingCap
  dataHistorical.keeperFeesLiquidationRatio = data.keeperFeesLiquidationRatio
  dataHistorical.maintenanceMargin = data.maintenanceMargin
  dataHistorical.blockNumber = block.number
  dataHistorical.timestamp = roundedTimestamp
  if (!apr.equals(ZERO_BD)) {
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
  let apr: BigDecimal
  if (result.reverted || block.number.gt(BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR)) {
    const resultAPR = poolManager.try_estimatedAPR()
    apr = resultAPR.reverted ? ZERO_BD : convertTokenToDecimal(resultAPR.value, DECIMAL_TOKENS)
  } else {
    const interestForSurplus = convertTokenToDecimal(result.value, DECIMAL_PARAMS)
    const resultAPR = poolManager.try_estimatedAPR()
    apr = resultAPR.reverted
      ? ZERO_BD
      : convertTokenToDecimal(resultAPR.value, DECIMAL_TOKENS).times(ONE_BD.minus(interestForSurplus))
  }

  // Better to set the id to the poolManager than the oracle as there is more chances that the oracle is updated
  const id = poolManager._address.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistorical = oracle._address.toHexString() + '_' + roundedTimestamp.toString()

  let data = OracleCoreData.load(id)
  if (data == null) {
    data = new OracleCoreData(id)
  }

  let rates: BigDecimal[]
  if (resultRates.reverted) {
    rates = [data.rateLower, data.rateUpper]
  } else {
    rates = [convertTokenToDecimal(resultRates.value.value0, DECIMAL_TOKENS), convertTokenToDecimal(resultRates.value.value1, DECIMAL_TOKENS)]
  }

  data.oracle = oracle._address.toHexString()
  data.tokenOut = stableName
  data.tokenIn = collatName
  data.rateLower = rates[0]
  data.rateUpper = rates[1]
  data.blockNumber = block.number
  data.timestamp = block.timestamp

  let dataOracleAprHistoricalHour = OracleAPRCoreHistoricalData.load(idHistorical)
  if (dataOracleAprHistoricalHour == null) {
    dataOracleAprHistoricalHour = new OracleAPRCoreHistoricalData(idHistorical)
    dataOracleAprHistoricalHour.collatName = token.symbol()
    dataOracleAprHistoricalHour.stableName = agToken.symbol()
    dataOracleAprHistoricalHour.rateLower = rates[0]
    dataOracleAprHistoricalHour.rateUpper = rates[1]
    dataOracleAprHistoricalHour.timestamp = roundedTimestamp
    dataOracleAprHistoricalHour.blockNumber = block.number
    // if the call didn't failed then update the value
    if (!apr.equals(ZERO_BD)) {
      dataOracleAprHistoricalHour.apr = apr
    }
  } else {
    // for the moment we just update with the last value in the hour but we could easier takes the first in the hour
    // or takes the mean (by adding a field to the struct to track the nuber of points so far) or more advanced metrics
    dataOracleAprHistoricalHour.collatName = token.symbol()
    dataOracleAprHistoricalHour.stableName = agToken.symbol()
    dataOracleAprHistoricalHour.rateLower = rates[0]
    dataOracleAprHistoricalHour.rateUpper = rates[1]
    dataOracleAprHistoricalHour.timestamp = roundedTimestamp
    dataOracleAprHistoricalHour.blockNumber = block.number
    // if the call didn't failed then update the value
    if (!apr.equals(ZERO_BD)) {
      dataOracleAprHistoricalHour.apr = apr
    }
  }

  data.save()
  dataOracleAprHistoricalHour.save()
}


export function _piecewiseLinear(value: BigDecimal, xArray: BigDecimal[], yArray: BigDecimal[]): BigDecimal {
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
    .div(xArray[i + 1].minus(xArray[i]))
  const normalized = pct
    .times(yArray[i + 1].minus(yArray[i]))
    .plus(yArray[i])

  return normalized
}

export function _computeHedgeRatio(
  perpetualManager: PerpetualManagerFront,
  stocksUsers: BigDecimal,
  currentHedgeAmount: BigDecimal
): BigDecimal {
  const targetHAHedge = convertTokenToDecimal(perpetualManager.targetHAHedge(), DECIMAL_PARAMS)
  // Fetching info from the `StableMaster`: the amount to hedge is based on the `stocksUsers`
  // of the given collateral
  const targetHedgeAmount = stocksUsers.times(targetHAHedge)

  let ratio: BigDecimal
  if (currentHedgeAmount.lt(targetHedgeAmount)) ratio = currentHedgeAmount.div(targetHedgeAmount)
  else ratio = ONE_BD

  return ratio
}

export function _getFeesOpenPerp(
  perpetualManager: PerpetualManagerFront,
  poolManager: PoolManager,
  event: PerpetualOpened
): BigDecimal {
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const collateral = collatData.value0
  const collateralInfo = getToken(collateral)
  const stocksUsers = convertTokenToDecimal(collatData.value4, collateralInfo.decimals)
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const totalHedgeAmountUpdate = convertTokenToDecimal(event.params._committedAmount, collateralInfo.decimals).times(convertTokenToDecimal(event.params._entryRate, DECIMAL_TOKENS))

  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers, totalHedgeAmount.plus(totalHedgeAmountUpdate))
  const haFeesDeposit = _getDepositFees(poolManager._address, hedgeRatio)
  // Fees are rounded to the advantage of the protocol
  const fee = convertTokenToDecimal(event.params._committedAmount, collateralInfo.decimals).times(haFeesDeposit)
  return fee
}

export function _getCashOutAmount(perp: Perpetual, currentRate: BigDecimal): BigDecimal {
  // All these computations are made just because we are working with uint and not int
  // so we cannot do x-y if x<y
  const newCommit = perp.committedAmount.times(perp.entryRate).div(currentRate)
  // Checking if a liquidation is needed: for this to happen the `cashOutAmount` should be inferior
  // to the maintenance margin of the perpetual
  let cashOutAmount: BigDecimal
  if (newCommit.ge(perp.committedAmount.plus(perp.margin))) cashOutAmount = ZERO_BD
  else {
    // The definition of the margin ratio is `(margin + PnL) / committedAmount`
    // where `PnL = commit * (1-entryRate/currentRate)`
    // So here: `newCashOutAmount = margin + PnL`
    cashOutAmount = perp.committedAmount.plus(perp.margin).minus(newCommit)
  }
  return cashOutAmount
}

export function _getFeesClosePerp(perpetualManager: PerpetualManagerFront, perp: Perpetual): BigDecimal {
  const oracle = Oracle.bind(perpetualManager.oracle())
  const currentRate = convertTokenToDecimal(oracle.readLower(), DECIMAL_TOKENS)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const collateral = collatData.value0
  const collateralInfo = getToken(collateral)
  const stocksUsers = convertTokenToDecimal(collatData.value4, collateralInfo.decimals)
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const cashOutAmount = _getCashOutAmount(perp, currentRate)
  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers, totalHedgeAmount)

  const feeWithdraw = _getWithdrawFees(poolManager._address, hedgeRatio)
  // Rounding the fees at the protocol's advantage
  let feesPaid = perp.committedAmount.times(feeWithdraw)
  if (feesPaid.ge(cashOutAmount)) {
    feesPaid = cashOutAmount
  }
  return feesPaid
}

export function _getFeesLiquidationPerp(perpetualManager: PerpetualManagerFront, perp: Perpetual, collateralInfo: Token): BigDecimal[] {
  const oracle = Oracle.bind(perpetualManager.oracle())
  const currentRate = convertTokenToDecimal(oracle.readLower(), DECIMAL_TOKENS)
  const cashOutAmount = _getCashOutAmount(perp, currentRate)
  const keeperFeesLiquidationRatio = convertTokenToDecimal(perpetualManager.keeperFeesLiquidationRatio(), DECIMAL_PARAMS)
  const keeperFeesLiquidationCap = convertTokenToDecimal(perpetualManager.keeperFeesLiquidationCap(), collateralInfo.decimals)

  let keeperFees = cashOutAmount.times(keeperFeesLiquidationRatio)
  keeperFees = keeperFees.lt(keeperFeesLiquidationCap) ? keeperFees : keeperFeesLiquidationCap
  const protocolFees = cashOutAmount.minus(keeperFees)
  return [protocolFees, keeperFees]
}

export function _getMintFee(stableMaster: StableMaster, poolManager: PoolManager, amount: BigDecimal): BigDecimal[] {
  const collatData = stableMaster.collateralMap(poolManager._address)
  const oracle = Oracle.bind(collatData.value3)
  const collateral = collatData.value0
  const collateralInfo = getToken(collateral)
  const feeData = collatData.value8
  const stocksUsers = convertTokenToDecimal(collatData.value4, collateralInfo.decimals)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const amountForUserInStable = amount.times(convertTokenToDecimal(oracle.readLower(), DECIMAL_TOKENS))
  const hedgeRatio = _computeHedgeRatio(perpetualManager, amountForUserInStable.plus(stocksUsers), totalHedgeAmount)
  // Fees could in some occasions depend on other factors like collateral ratio
  // Keepers are the ones updating this part of the fees
  const feeMint = _getMintPercentageFees(feeData, hedgeRatio)
  const fee = amount.times(feeMint)
  const percentFeesForSLPs = convertTokenToDecimal(collatData.value7.feesForSLPs, DECIMAL_PARAMS)
  const SLPFees = fee.times(percentFeesForSLPs)
  return [fee.minus(SLPFees), SLPFees]
}

export function _getBurnFee(stableMaster: StableMaster, poolManager: PoolManager, amount: BigDecimal): BigDecimal[] {
  const collatData = stableMaster.collateralMap(poolManager._address)
  const oracle = Oracle.bind(collatData.value3)
  const collateral = collatData.value0
  const collateralInfo = getToken(collateral)
  const feeData = collatData.value8
  const stocksUsers = convertTokenToDecimal(collatData.value4, collateralInfo.decimals)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers.minus(amount), totalHedgeAmount)

  // Getting the highest possible oracle value
  const oracleValue = convertTokenToDecimal(oracle.readUpper(), DECIMAL_TOKENS)

  // Computing how much of collateral can be redeemed by the user after taking fees
  // The value of the fees here is `_computeFeeBurn(amount,col)` (it is a proportion expressed in `BASE_PARAMS`)
  // The real value of what can be redeemed by the user is `amountInC * (BASE_PARAMS - fees) / BASE_PARAMS`,
  // but we prefer to avoid doing multiplications after divisions
  const fee = amount
    .times(_getBurnPercentageFees(feeData, hedgeRatio))
    .div(oracleValue)

  const percentFeesForSLPs = convertTokenToDecimal(collatData.value7.feesForSLPs, DECIMAL_PARAMS)
  const SLPFees = fee.times(percentFeesForSLPs)
  return [fee.minus(SLPFees), SLPFees]
}

export function _getMintPercentageFees(
  feeData: StableMaster__collateralMapResultFeeDataStruct,
  hedgeRatio: BigDecimal
): BigDecimal {
  const bonusMalusMint = convertTokenToDecimal(feeData.bonusMalusMint, DECIMAL_PARAMS)
  const xFeeMint = convertTokenListToDecimal(feeData.xFeeMint, DECIMAL_PARAMS)
  const yFeeMint = convertTokenListToDecimal(feeData.yFeeMint, DECIMAL_PARAMS)

  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = bonusMalusMint.times(_piecewiseLinear(hedgeRatio, xFeeMint, yFeeMint))
  return feesPaid
}

export function _getBurnPercentageFees(
  feeData: StableMaster__collateralMapResultFeeDataStruct,
  hedgeRatio: BigDecimal
): BigDecimal {
  const bonusMalusBurn = convertTokenToDecimal(feeData.bonusMalusBurn, DECIMAL_PARAMS)
  const xFeeBurn = convertTokenListToDecimal(feeData.xFeeBurn, DECIMAL_PARAMS)
  const yFeeBurn = convertTokenListToDecimal(feeData.yFeeBurn, DECIMAL_PARAMS)
  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = bonusMalusBurn.times(_piecewiseLinear(hedgeRatio, xFeeBurn, yFeeBurn))
  return feesPaid
}

export function _getDepositFees(poolManager: Address, hedgeRatio: BigDecimal): BigDecimal {
  let data = PoolData.load(poolManager.toHexString())!
  const haBonusMalusDeposit = data.haBonusMalusDeposit
  const xHAFeesDeposit = data.xHAFeesDeposit
  const yHAFeesDeposit = data.yHAFeesDeposit

  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = haBonusMalusDeposit
    .times(_piecewiseLinear(hedgeRatio, xHAFeesDeposit, yHAFeesDeposit))

  return feesPaid
}

export function _getWithdrawFees(poolManager: Address, hedgeRatio: BigDecimal): BigDecimal {
  let data = PoolData.load(poolManager.toHexString())!
  const haBonusMalusWithdraw = data.haBonusMalusWithdraw
  const xHAFeesWithdraw = data.xHAFeesWithdraw
  const yHAFeesWithdraw = data.yHAFeesWithdraw

  const feesPaid = haBonusMalusWithdraw
    .times(_piecewiseLinear(hedgeRatio, xHAFeesWithdraw, yHAFeesWithdraw))

  return feesPaid
}

export function _getForceCloseFees(
  poolManager: Address,
  hedgeRatio: BigDecimal,
  closeFee: BigDecimal
): BigDecimal[] {
  let data = PoolData.load(poolManager.toHexString())!
  const keeperFeesClosingCap = data.keeperFeesClosingCap
  const xKeeperFeesClosing = data.xKeeperFeesClosing
  const yKeeperFeesClosing = data.yKeeperFeesClosing

  let keeperFees = closeFee.times(_piecewiseLinear(hedgeRatio, xKeeperFeesClosing, yKeeperFeesClosing))
  keeperFees = keeperFees.lt(keeperFeesClosingCap) ? keeperFees : keeperFeesClosingCap
  const protocolFees = closeFee.minus(keeperFees)

  return [protocolFees, keeperFees]
}


// Change back to angle-subgraph-borrow implementation when circuitChainlink() is implemented 
// in all oracles
export function _trackNewChainlinkOracle(oracle: Oracle, timestamp: BigInt): void {
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
      const aggregator = proxy.aggregator()
      ChainlinkTemplate.create(aggregator)
      // init the oracle value
      _initAggregator(ChainlinkFeed.bind(aggregator), timestamp);
    }
  }
}

export function _initAggregator(feed: ChainlinkFeed, timestamp: BigInt): void {
  const tokens = parseOracleDescription(feed.description(), false)
  const decimals = BigInt.fromI32(feed.decimals())

  const dataOracle = new OracleData(feed._address.toHexString())
  // here we assume that Chainlink always put the non-USD token first
  dataOracle.tokenTicker = tokens[0]
  // The borrowing module does not handle rebasing tokens, so the only accepted token is wstETH
  // if the in token is wstETH we also need to multiply by the rate wstETH to stETH - as we are looking at the stETH oracle because on 
  // mainnet the oracle wstETH-stETH does not exist
  let quoteAmount = BASE_TOKENS;
  if (tokens[0] == "STETH") {
    dataOracle.tokenTicker = "wSTETH"
    quoteAmount = stETH.bind(Address.fromString(STETH_ADDRESS)).getPooledEthByShares(BASE_TOKENS)
  }
  dataOracle.price = convertTokenToDecimal(quoteAmount, DECIMAL_TOKENS).times(convertTokenToDecimal(feed.latestAnswer(), decimals))
  dataOracle.decimals = decimals
  dataOracle.timestamp = timestamp
  dataOracle.save()

  log.warning('=== new Oracle: {} {}', [tokens[0], tokens[1]])

  // OracleByTicker will point to OracleData and be indexed by token address, which will help us retrieve the second oracle in `getCollateralPriceInAgToken`
  const dataOracleByTicker = new OracleByTicker(dataOracle.tokenTicker)
  dataOracleByTicker.oracle = dataOracle.id
  dataOracleByTicker.save()
}

export function getToken(tokenAddress: Address): Token {
  let token = Token.load(tokenAddress.toHexString())
  // fetch info if null
  if (token === null) {
    token = new Token(tokenAddress.toHexString())
    let contract = ERC20.bind(tokenAddress)
    token.symbol = contract.symbol()
    token.name = contract.name()
    token.decimals = BigInt.fromI32(contract.decimals())

    token.save()
  }
  return token
}