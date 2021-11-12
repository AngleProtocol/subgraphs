import { BigInt } from '@graphprotocol/graph-ts'

export const BASE_PARAMS = BigInt.fromString('10').pow(9)
export const BASE_TOKENS = BigInt.fromString('10').pow(18)
export const ROUND_COEFF = BigInt.fromString('1800') // 30 minutes
