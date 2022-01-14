import { BigInt } from '@graphprotocol/graph-ts'

export const BASE_PARAMS = BigInt.fromString('10').pow(9)
export const BASE_TOKENS = BigInt.fromString('10').pow(18)
export const ROUND_COEFF = BigInt.fromString('1800') // 30 minutes
export const LARGE_ROUND_COEFF = BigInt.fromString('86400') // 1 day

export const MAX_LOCK_TIME = BigInt.fromString('4')
  .times(BigInt.fromString('365'))
  .times(BigInt.fromString('86400'))
export const WEEK = BigInt.fromString('7').times(BigInt.fromString('86400'))
