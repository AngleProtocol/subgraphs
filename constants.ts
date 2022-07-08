import { BigInt, Bytes } from '@graphprotocol/graph-ts'

export const BASE_PARAMS = BigInt.fromString('10').pow(9)
export const BASE_TOKENS = BigInt.fromString('10').pow(18)
export const BASE_INTEREST = BigInt.fromString('10').pow(27)

export const ROUND_COEFF = BigInt.fromString('1800') // 30 minutes
export const LARGE_ROUND_COEFF = BigInt.fromString('86400') // 1 day

const _max = new Bytes(32)
for (let i = 0; i < _max.length; i++) {
  _max[i] = 0xff
}
export const MAX_UINT256 = BigInt.fromUnsignedBytes(_max)

export const MAX_LOCK_TIME = BigInt.fromString('4')
  .times(BigInt.fromString('365'))
  .times(BigInt.fromString('86400'))
export const WEEK = BigInt.fromString('7').times(BigInt.fromString('86400'))
// This constant is used to do a fast re-index of the Borrow subgraph after a crash.
// For events happening below this timestamp, vaults will be updated every (at most) `FAST_SYNC_TIME_INTERVAL` seconds
// instead of being updated at every oracle update. This is a considerable speedup.
// Once the subgraph is indexed, this threshold should be set to 0 to launch a slow but accurate indexing in background.
export const FAST_SYNC_THRESHOLD = BigInt.fromString('0')
// 3 hours minimal interval between vault refresh (see above)
export const FAST_SYNC_TIME_INTERVAL = BigInt.fromString('10800')
export const ORACLE_SYNC_TIME_INTERVAL = BigInt.fromString('3600')

export const BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR = BigInt.fromString('14665999')
