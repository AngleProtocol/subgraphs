import { OracleByTicker, OracleData } from '../../generated/schema'
import { log, BigInt, Address } from '@graphprotocol/graph-ts'
import { parseOracleDescription } from './utils'
import {
  BASE_TOKENS,
  ORACLE_SYNC_TIME_INTERVAL
} from '../../../constants'
import { AnswerUpdated, ChainlinkFeed } from '../../generated/templates/ChainlinkTemplate/ChainlinkFeed'

// Handler used to periodically refresh Oracles
export function handleAnswerUpdated(event: AnswerUpdated): void {
  const feed = ChainlinkFeed.bind(event.address)

  let dataOracle = OracleData.load(event.address.toHexString())
  if (dataOracle == null) {
    const feed = ChainlinkFeed.bind(event.address)
    const tokens = parseOracleDescription(feed.description(), false)
    const decimals = feed.decimals()

    dataOracle = new OracleData(event.address.toHexString())
    // here we assume that Chainlink always put the non-USD token first
    dataOracle.tokenTicker = tokens[0]
    dataOracle.price = event.params.current.times(BASE_TOKENS).div(BigInt.fromString('10').pow(decimals as u8))
    dataOracle.decimals = BigInt.fromI32(decimals)
    dataOracle.timestamp = event.block.timestamp
    dataOracle.save()

    log.warning('=== new Oracle: {} {}', [tokens[0], tokens[1]])

    // OracleByTicker will point to OracleData and be indexed by token address, which will help us retrieve the second oracle in `getCollateralPriceInAgToken`
    const dataOracleByTicker = new OracleByTicker(dataOracle.tokenTicker)
    dataOracleByTicker.oracle = dataOracle.id
    dataOracleByTicker.save()
    // mostly used for high frequency block blockchain
  } else if (event.block.timestamp.minus(dataOracle.timestamp).lt(ORACLE_SYNC_TIME_INTERVAL)) {
    return
  } else {
    dataOracle.price = event.params.current.times(BASE_TOKENS).div(BigInt.fromString('10').pow(dataOracle.decimals.toI32() as u8))
    dataOracle.timestamp = event.block.timestamp
    dataOracle.save()
  }
}

export function getCollateralPrice(
  collateralOracleByTicker: OracleByTicker
): BigInt {
  const collateralPriceInUSD = OracleData.load(collateralOracleByTicker.oracle)!.price
  return collateralPriceInUSD
}
