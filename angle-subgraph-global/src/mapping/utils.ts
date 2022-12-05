import { Address, ethereum, BigInt, log, BigDecimal } from '@graphprotocol/graph-ts'
import { OracleData, OracleByTicker, Token } from '../../generated/schema'
import { BASE_TOKENS, ROUND_COEFF, STETH_ADDRESS, DECIMAL_TOKENS } from '../../../constants'
import { ChainlinkTemplate } from '../../generated/templates'
import { ChainlinkProxy } from '../../generated/templates/ChainlinkTemplate/ChainlinkProxy'
import { stETH } from '../../generated/templates/AgTokenTemplate/stETH'
import { Oracle } from '../../generated/templates/AgTokenTemplate/Oracle'
import { ERC20 } from '../../generated/templates/AgTokenTemplate/ERC20'
import { ChainlinkFeed } from '../../generated/templates/ChainlinkTemplate/ChainlinkFeed'
import { convertTokenToDecimal } from '../utils'


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