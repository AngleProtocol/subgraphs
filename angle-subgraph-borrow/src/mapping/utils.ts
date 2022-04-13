import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { ROUND_COEFF } from '../../../constants'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}