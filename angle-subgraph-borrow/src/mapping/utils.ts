import { ethereum, BigInt, log, Address } from '@graphprotocol/graph-ts'
import { BASE_TOKENS, ROUND_COEFF, STETH_ADDRESS } from '../../../constants'
import { stETH } from '../../generated/Chainlink8/stETH'
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


export function _trackNewChainlinkOracle(oracle: Oracle, event: ethereum.Event): void {
  // check all 
  const result = oracle.try_circuitChainlink()
  if (!result.reverted) {
    for (let i = 0; i < result.value.length; i++) {
      const oracleProxyAddress = result.value[i]
      const proxy = ChainlinkProxy.bind(oracleProxyAddress)
      const aggregator = proxy.aggregator()
      ChainlinkTemplate.create(aggregator)
      // init the oracle value
      _initAggregator(ChainlinkFeed.bind(aggregator), event);
    }
  }
}

export function _initAggregator(feed: ChainlinkFeed, event: ethereum.Event): void {
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
  dataOracle.price = quoteAmount.times(feed.latestAnswer()).div(BASE_TOKENS)
  dataOracle.decimals = decimals
  dataOracle.timestamp = event.block.timestamp
  dataOracle.save()

  log.warning('=== new Oracle: {} {}', [tokens[0], tokens[1]])

  // OracleByTicker will point to OracleData and be indexed by token address, which will help us retrieve the second oracle in `getCollateralPriceInAgToken`
  const dataOracleByTicker = new OracleByTicker(dataOracle.tokenTicker)
  dataOracleByTicker.oracle = dataOracle.id
  dataOracleByTicker.save()
}

