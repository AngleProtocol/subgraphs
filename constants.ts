import { Address, BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'


export const DECIMAL_PARAMS = BigInt.fromString('9')
export const DECIMAL_TOKENS = BigInt.fromString('18')
export const DECIMAL_INTEREST = BigInt.fromString('27')

export const BASE_PARAMS = BigInt.fromString('10').pow(9)
export const BASE_TOKENS = BigInt.fromString('10').pow(18)
export const BASE_INTEREST = BigInt.fromString('10').pow(27)

export const ROUND_COEFF = BigInt.fromString('43200') //  1/2 day
export const LARGE_ROUND_COEFF = BigInt.fromString('86400') // 1 day
export const ZERO = BigInt.fromString('0')
export const ONE = BigInt.fromString('1')
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')


const _max = new Bytes(32)
for (let i = 0; i < _max.length; i++) {
  _max[i] = 0xff
}
export const MAX_UINT256 = BigInt.fromUnsignedBytes(_max)
export const MAX_DECIMAL = BigDecimal.fromString(BASE_INTEREST.toString())

export const MAX_LOCK_TIME = BigInt.fromString('4')
  .times(BigInt.fromString('365'))
  .times(BigInt.fromString('86400'))
export const WEEK = BigInt.fromString('7').times(BigInt.fromString('86400'))
// This constant is used to do a fast re-index of the Borrow subgraph after a crash.
// For events happening below this timestamp, vaults will be updated every (at most) `FAST_SYNC_TIME_INTERVAL` seconds
// instead of being updated at every oracle update. This is a considerable speedup.
// Once the subgraph is indexed, this threshold should be set to 0 to launch a slow but accurate indexing in background.
export const FAST_SYNC_THRESHOLD = BigInt.fromString('1665563767')
// 3 hours minimal interval between vault refresh (see above)
export const FAST_SYNC_TIME_INTERVAL = BigInt.fromString('86400')
export const ORACLE_SYNC_TIME_INTERVAL = BigInt.fromString('3600')

export const BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR = BigInt.fromString('14665999')

export const STETH_ADDRESS = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"
export const ZERO_ADDRESS = Address.fromHexString("0x0000000000000000000000000000000000000000")
