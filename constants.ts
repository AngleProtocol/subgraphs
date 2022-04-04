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
