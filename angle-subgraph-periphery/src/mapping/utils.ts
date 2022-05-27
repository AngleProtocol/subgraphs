import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERC20 } from '../../generated/templates/StableMasterTemplate/ERC20'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { Oracle, Oracle__readAllResult } from '../../generated/templates/StableMasterTemplate/Oracle'
import { OracleAPRHistoricalData, OracleData } from '../../generated/schema'
import { BASE_PARAMS, BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR, ROUND_COEFF } from '../../../constants'

export function historicalSlice(block: ethereum.Block, roundCoeff: BigInt = ROUND_COEFF): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(roundCoeff)
  const hourStartTimestamp = hourId.times(roundCoeff)

  return hourStartTimestamp
}

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

  const id = oracle._address.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistorical = oracle._address.toHexString() + '_' + roundedTimestamp.toString()

  let data = OracleData.load(id)
  if (data == null) {
    data = new OracleData(id)
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

  let dataOracleAprHistoricalHour = OracleAPRHistoricalData.load(idHistorical)
  if (dataOracleAprHistoricalHour == null) {
    dataOracleAprHistoricalHour = new OracleAPRHistoricalData(idHistorical)
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
