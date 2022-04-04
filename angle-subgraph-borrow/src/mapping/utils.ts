import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { ROUND_COEFF, BASE_PARAMS, BASE_TOKENS } from '../../../constants'

import { log } from '@graphprotocol/graph-ts'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

export function computeDebt(normalizedDebt: BigInt, interestAccumulator: BigInt): BigInt {
  return normalizedDebt.times(interestAccumulator).div(BASE_PARAMS.times(BASE_TOKENS))
}

export function computeHealthFactor(
  collateral: BigInt,
  collateralBase: BigInt,
  oracleValue: BigInt,
  debt: BigInt,
  collateralFactor: BigInt
): BigInt {
  if (debt.isZero()) {
    // avoid division by zero
    return BigInt.fromI32(1)
  }
  return collateral.times(collateralFactor.times(oracleValue)).div(debt.times(collateralBase))
}
