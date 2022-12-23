import { ethereum, BigInt, log, Address } from '@graphprotocol/graph-ts'
import { BASE_TOKENS, ROUND_COEFF, STETH_ADDRESS } from '../../../constants'
import { stETH } from '../../generated/templates/ChainlinkTemplate/stETH'
import { OracleByTicker, OracleData } from '../../generated/schema'
import { ChainlinkTemplate } from '../../generated/templates'
import { ChainlinkFeed } from '../../generated/templates/ChainlinkTemplate/ChainlinkFeed'
import { ChainlinkProxy } from '../../generated/templates/TreasuryTemplate/ChainlinkProxy'
import { Oracle } from '../../generated/templates/TreasuryTemplate/Oracle'
import { _initTreasury } from './treasuryHelpers'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

let wrappedTokens = new Map<string, string>()
wrappedTokens.set('WBTC', 'BTC')
wrappedTokens.set('wETH', 'ETH')

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


export function _trackNewChainlinkOracle(oracle: Oracle, event: ethereum.Event, trackFullOracle: boolean): void {
  const linkedOracles: string[] = []
  // check all
  const result = oracle.try_circuitChainlink()
  if (!result.reverted) {
    log.warning('===  circuit chainlink : {} {}', [oracle._address.toHexString(), result.value.length.toString()])
    for (let i = 0; i < result.value.length; i++) {
      const oracleProxyAddress = result.value[i]
      const proxy = ChainlinkProxy.bind(oracleProxyAddress)
      const aggregator = proxy.aggregator()

      const existentOracle = OracleData.load(aggregator.toHexString())
      if (existentOracle == null) {
        ChainlinkTemplate.create(aggregator)
        // init the oracle value
        const tokenTicker = _initAggregator(ChainlinkFeed.bind(aggregator), event);
        linkedOracles.push(tokenTicker)
      } else linkedOracles.push(existentOracle.tokenTicker)
    }
  }
  // the agToken will always be tracked at this point
  if (trackFullOracle) _initOracle(oracle, linkedOracles, event)

}

export function _initAggregator(feed: ChainlinkFeed, event: ethereum.Event): string {
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
  } else if (tokens[0] == "MIMATIC") dataOracle.tokenTicker = "MAI"
  dataOracle.linkedOracles = []
  dataOracle.price = quoteAmount.times(feed.latestAnswer()).div(BASE_TOKENS)
  dataOracle.decimals = decimals
  dataOracle.timestamp = event.block.timestamp
  dataOracle.save()

  log.warning('=== new Oracle: {} {}', [tokens[0], tokens[1]])

  // OracleByTicker will point to OracleData and be indexed by token address, which will help us retrieve the second oracle in `getCollateralPriceInAgToken`
  const dataOracleByTicker = new OracleByTicker(dataOracle.tokenTicker)
  dataOracleByTicker.oracle = dataOracle.id
  dataOracleByTicker.save()

  return dataOracle.tokenTicker
}

export function _initOracle(oracle: Oracle, linkedOracles: string[], event: ethereum.Event): void {
  const tokens = parseOracleDescription(oracle.DESCRIPTION(), true)
  // We need it to put the price back in USD
  const agTokenOracleByTicker = OracleByTicker.load(tokens[1])!
  const agTokenPriceInUSD = OracleData.load(agTokenOracleByTicker.oracle)!.price

  const decimals = BigInt.fromString("18")
  const dataOracle = new OracleData(oracle._address.toHexString())
  dataOracle.tokenTicker = tokens[0]
  dataOracle.linkedOracles = linkedOracles
  dataOracle.price = oracle.read().times(agTokenPriceInUSD).div(BigInt.fromString('10').pow(8))
  dataOracle.decimals = decimals
  dataOracle.timestamp = event.block.timestamp
  dataOracle.save()

  log.warning('=== new Oracle: {}', [dataOracle.tokenTicker])

  // OracleByTicker will point to OracleData and be indexed by token address, which will help us retrieve the second oracle in `getCollateralPriceInAgToken`
  const dataOracleByTicker = new OracleByTicker(dataOracle.tokenTicker)
  dataOracleByTicker.oracle = dataOracle.id
  dataOracleByTicker.save()
}

