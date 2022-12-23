import { Address, ethereum, log, BigDecimal } from '@graphprotocol/graph-ts'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERC20 } from '../../generated/templates/StableMasterTemplate/ERC20'
import { SanToken } from '../../generated/templates/StableMasterTemplate/SanToken'
import { AgToken as AgTokenContract } from '../../generated/templates/StableMasterTemplate/AgToken'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { Oracle } from '../../generated/templates/AgTokenTemplate/Oracle'
import { PoolData, StableData, StableHistoricalData, PoolHistoricalData, Perpetual, FeeData, OracleByTicker, FeeHistoricalData, OracleCoreData, OracleAPRCoreHistoricalData, Token } from '../../generated/schema'
import { BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR, DECIMAL_PARAMS, ZERO_BD, ONE_BD, DECIMAL_TOKENS } from '../../../constants'
import { PerpetualOpened } from '../../generated/templates/PerpetualManagerFrontTemplate/PerpetualManagerFront'
import { getCollateralPrice } from './chainlink'
import { convertTokenToDecimal } from '../utils'
import { getToken, historicalSlice, _piecewiseLinear, _trackNewChainlinkOracle } from './utils'

export function updateStableData(stableMaster: StableMaster, block: ethereum.Block): void {
  const roundedTimestamp = historicalSlice(block)

  const agToken = ERC20.bind(stableMaster.agToken())
  const stablecoinInfo = getToken(agToken._address)
  const id = stableMaster._address.toHexString()
  const idHistorical = stableMaster._address.toHexString() + '_hour_' + roundedTimestamp.toString()

  let data = StableData.load(id)
  if (data == null) {
    data = new StableData(id)
    data.poolsAddress = []
  }

  const name = stablecoinInfo.symbol
  data.name = name

  const resultCollatRatio = stableMaster.try_getCollateralRatio()
  if (!resultCollatRatio.reverted) {
    data.collatRatio = convertTokenToDecimal(resultCollatRatio.value, DECIMAL_PARAMS)
  }

  const totalMinted = agToken.totalSupply()
  const agTokenInfo = getToken(agToken._address)
  data.totalMinted = convertTokenToDecimal(totalMinted, agTokenInfo.decimals)
  // compute the tvl
  let tvl = ZERO_BD
  for (let i = 0; i < data.poolsAddress.length; i++) {
    const dataPool = PoolData.load(data.poolsAddress[i])!
    tvl = tvl.plus(dataPool.totalAsset!.times(dataPool.rateUpper!))
  }

  data.tvl = tvl
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
    dataHistoricalHour.tvl = tvl
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
    dataHistoricalHour.tvl = tvl
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
  feeDataHistorical.surplusFromInterests = feeData.surplusFromInterests
  feeDataHistorical.surplusFromBorrowFees = feeData.surplusFromBorrowFees
  feeDataHistorical.surplusFromRepayFees = feeData.surplusFromRepayFees
  feeDataHistorical.surplusFromLiquidationSurcharges = feeData.surplusFromLiquidationSurcharges
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
  const collatData = stableMaster.collateralMap(poolManager._address)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)
  const oracle = Oracle.bind(collatData.value3)

  const id = poolManager._address.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistorical = poolManager._address.toHexString() + '_hour_' + roundedTimestamp.toString()

  let totalMargin: BigDecimal
  let stablecoinInfo: Token
  let collateralInfo: Token

  let data = PoolData.load(id)
  if (data == null) {
    data = new PoolData(id)
    totalMargin = ZERO_BD
    _trackNewChainlinkOracle(oracle, block.timestamp, true);

    const token = ERC20.bind(poolManager.token())
    const agToken = AgTokenContract.bind(stableMaster.agToken())

    const stableMasterAddress = poolManager.stableMaster().toHexString()
    collateralInfo = getToken(token._address)
    stablecoinInfo = getToken(agToken._address)

    data.poolManager = poolManager._address.toHexString()
    data.perpetualManager = perpetualManager._address.toHexString()
    data.decimals = collateralInfo.decimals
    data.stableMaster = stableMasterAddress
    data.stableName = stablecoinInfo.symbol
    data.stablecoin = agToken._address.toHexString()
    data.collatName = collateralInfo.symbol
    data.collateral = token._address.toHexString()
  } else {
    stablecoinInfo = getToken(Address.fromString(data.stablecoin))
    collateralInfo = getToken(Address.fromString(data.collateral))
    // just in case it changes but it can't happen
    data.perpetualManager = perpetualManager._address.toHexString()
  }

  const stableMasterAddress = data.stableMaster
  const stableName = stablecoinInfo.symbol
  const collatName = collateralInfo.symbol

  data.oracle = oracle._address.toHexString()

  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), stablecoinInfo.decimals)
  totalMargin = add ? data.totalMargin.plus(margin) : data.totalMargin.minus(margin)

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
  let poolData = PoolData.load(poolManager._address.toHexString())!
  const collateralInfo = getToken(Address.fromString(poolData.collateral))
  const stablecoinInfo = getToken(Address.fromString(poolData.stablecoin))
  const oracle = Oracle.bind(Address.fromString(poolData.oracle))

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
  data.tokenOut = stablecoinInfo.symbol
  data.tokenIn = collateralInfo.symbol
  data.rateLower = rates[0]
  data.rateUpper = rates[1]
  data.blockNumber = block.number
  data.timestamp = block.timestamp

  let dataOracleAprHistoricalHour = OracleAPRCoreHistoricalData.load(idHistorical)
  if (dataOracleAprHistoricalHour == null) {
    dataOracleAprHistoricalHour = new OracleAPRCoreHistoricalData(idHistorical)
    dataOracleAprHistoricalHour.collatName = collateralInfo.symbol
    dataOracleAprHistoricalHour.stableName = stablecoinInfo.symbol
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
  let poolData = PoolData.load(poolManager._address.toHexString())!
  const collateralInfo = getToken(Address.fromString(poolData.collateral))
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const totalHedgeAmountUpdate = convertTokenToDecimal(event.params._committedAmount, collateralInfo.decimals).times(convertTokenToDecimal(event.params._entryRate, DECIMAL_TOKENS))

  const hedgeRatio = _computeHedgeRatio(perpetualManager, poolData.stockUser, totalHedgeAmount.plus(totalHedgeAmountUpdate))
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

export function _getFeesClosePerp(perpetualManager: PerpetualManagerFront, poolManager: Address, perp: Perpetual): BigDecimal {
  let poolData = PoolData.load(poolManager.toHexString())!
  const oracle = Oracle.bind(Address.fromString(poolData.oracle))
  const currentRate = convertTokenToDecimal(oracle.readLower(), DECIMAL_TOKENS)
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const cashOutAmount = _getCashOutAmount(perp, currentRate)
  const hedgeRatio = _computeHedgeRatio(perpetualManager, poolData.stockUser, totalHedgeAmount)

  const feeWithdraw = _getWithdrawFees(poolManager, hedgeRatio)
  // Rounding the fees at the protocol's advantage
  let feesPaid = perp.committedAmount.times(feeWithdraw)
  if (feesPaid.ge(cashOutAmount)) {
    feesPaid = cashOutAmount
  }
  return feesPaid
}

export function _getFeesLiquidationPerp(poolManager: Address, perp: Perpetual, collateralInfo: Token): BigDecimal[] {
  const poolData = PoolData.load(poolManager.toHexString())!
  const oracle = Oracle.bind(Address.fromString(poolData.oracle))
  const currentRate = convertTokenToDecimal(oracle.readLower(), DECIMAL_TOKENS)
  const cashOutAmount = _getCashOutAmount(perp, currentRate)

  let keeperFees = cashOutAmount.times(poolData.keeperFeesLiquidationRatio)
  keeperFees = keeperFees.lt(poolData.keeperFeesLiquidationCap) ? keeperFees : poolData.keeperFeesLiquidationCap
  const protocolFees = cashOutAmount.minus(keeperFees)
  return [protocolFees, keeperFees]
}

export function _getMintFee(poolManager: PoolManager, amount: BigDecimal): BigDecimal[] {
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const stableData = StableData.load(poolData.stableMaster)!
  const oracle = Oracle.bind(Address.fromString(poolData.oracle))
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(poolData.perpetualManager))
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const amountForUserInStable = amount.times(convertTokenToDecimal(oracle.readLower(), DECIMAL_TOKENS))
  const hedgeRatio = _computeHedgeRatio(perpetualManager, amountForUserInStable.plus(poolData.stockUser), totalHedgeAmount)
  // Fees could in some occasions depend on other factors like collateral ratio
  // Keepers are the ones updating this part of the fees
  const feeMint = _getMintPercentageFees(poolData, hedgeRatio, stableData.collatRatio)
  const fee = amount.times(feeMint)
  const SLPFees = fee.times(poolData.feesForSLPs)
  return [fee.minus(SLPFees), SLPFees]
}

export function _getBurnFee(poolManager: PoolManager, amount: BigDecimal): BigDecimal[] {
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const stableData = StableData.load(poolData.stableMaster)!
  const oracle = Oracle.bind(Address.fromString(poolData.oracle))
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(poolData.perpetualManager))
  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const hedgeRatio = _computeHedgeRatio(perpetualManager, poolData.stockUser.minus(amount), totalHedgeAmount)

  // Getting the highest possible oracle value
  const oracleValue = convertTokenToDecimal(oracle.readUpper(), DECIMAL_TOKENS)

  // Computing how much of collateral can be redeemed by the user after taking fees
  // The value of the fees here is `_computeFeeBurn(amount,col)` (it is a proportion expressed in `BASE_PARAMS`)
  // The real value of what can be redeemed by the user is `amountInC * (BASE_PARAMS - fees) / BASE_PARAMS`,
  // but we prefer to avoid doing multiplications after divisions
  const fee = amount
    .times(_getBurnPercentageFees(poolData, hedgeRatio, stableData.collatRatio))
    .div(oracleValue)

  const SLPFees = fee.times(poolData.feesForSLPs)
  return [fee.minus(SLPFees), SLPFees]
}

export function _getMintPercentageFees(
  poolData: PoolData,
  hedgeRatio: BigDecimal,
  collatRatio: BigDecimal
): BigDecimal {
  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = _piecewiseLinear(collatRatio, poolData.xBonusMalusMint, poolData.yBonusMalusMint).times(
    _piecewiseLinear(hedgeRatio, poolData.xFeeMint, poolData.yFeeMint))
  return feesPaid
}

export function _getBurnPercentageFees(
  poolData: PoolData,
  hedgeRatio: BigDecimal,
  collatRatio: BigDecimal
): BigDecimal {
  // Computing the net margin of HAs to store in the perpetual: it consists simply in deducing fees
  // Those depend on how much is already hedged by HAs compared with what's to hedge
  const feesPaid = _piecewiseLinear(collatRatio, poolData.xBonusMalusBurn, poolData.yBonusMalusBurn).times(
    _piecewiseLinear(hedgeRatio, poolData.xFeeBurn, poolData.yFeeBurn))
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
