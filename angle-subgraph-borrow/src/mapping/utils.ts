import { ethereum, BigInt, log } from '@graphprotocol/graph-ts'
import { ROUND_COEFF } from '../../../constants'

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
// wrappedTokens.set('wstETH', 'stETH')

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
