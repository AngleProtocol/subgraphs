import {BigInt} from '@graphprotocol/graph-ts'

export const BASE_PARAMS = BigInt.fromString('10').pow(9)
export const BASE_TOKENS = BigInt.fromString('10').pow(18)
export const MAINTENANCE_MARGIN = BigInt.fromString('62500000')
export const ROUND_COEFF = BigInt.fromString('3600') // 1 hour
