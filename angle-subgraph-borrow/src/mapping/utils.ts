import { ethereum, BigInt, log } from '@graphprotocol/graph-ts'
import { ROUND_COEFF } from '../../../constants'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

// Whitespaces are stripped first. Then, `description` must be in the format "TOKEN1/TOKEN2" or "TOKEN1/TOKEN2Oracle".
export function parseOracleDescription(description: string, hasExtra: boolean): string[] {
  description = description.replace(' ', '')
  if(hasExtra) description = description.slice(0,-6)
  return description.split('/')
}