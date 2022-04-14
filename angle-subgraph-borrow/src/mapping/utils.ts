import { ethereum, BigInt, log } from '@graphprotocol/graph-ts'
import { ROUND_COEFF } from '../../../constants'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

// Description must be in the format "TOKEN1/TOKEN2" or "TOKEN1/TOKEN2 Oracle"
export function parseOracleDescription(description: string, hasExtra: boolean): string[] {
  if(hasExtra) description = description.slice(0,-7)
  return description.split('/')
}