import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { ROUND_COEFF, BASE_PARAMS, BASE_TOKENS, BASE_INTEREST, MAX_UINT256 } from '../../../constants'

import { log } from '@graphprotocol/graph-ts'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}

export function computeDebt(
  normalizedDebt: BigInt,
  ratePerSecond: BigInt,
  interestAccumulator: BigInt,
  lastInterestAccumulatorUpdated: BigInt,
  timestamp: BigInt
): BigInt {
  const exp = timestamp.minus(lastInterestAccumulatorUpdated)
  let currentInterestAccumulator = interestAccumulator
  if (!exp.isZero() && !ratePerSecond.isZero()) {
    const ZERO = BigInt.fromI32(0)
    const ONE = BigInt.fromI32(1)
    const TWO = BigInt.fromI32(2)
    const SIX = BigInt.fromI32(6)
    const HALF_BASE_INTEREST = BASE_INTEREST.div(TWO)
    const expMinusOne = exp.minus(ONE)
    const expMinusTwo = exp.gt(TWO) ? exp.minus(TWO) : ZERO
    const basePowerTwo = ratePerSecond
      .times(ratePerSecond)
      .plus(HALF_BASE_INTEREST)
      .div(BASE_INTEREST)
    const basePowerThree = basePowerTwo
      .times(ratePerSecond)
      .plus(HALF_BASE_INTEREST)
      .div(BASE_INTEREST)
    const secondTerm = exp
      .times(expMinusOne)
      .times(basePowerTwo)
      .div(TWO)
    const thirdTerm = exp
      .times(expMinusOne)
      .times(expMinusTwo)
      .times(basePowerThree)
      .div(SIX)
    currentInterestAccumulator = interestAccumulator
      .times(
        BASE_INTEREST.plus(ratePerSecond.times(exp))
          .plus(secondTerm)
          .plus(thirdTerm)
      )
      .div(BASE_INTEREST)
  }
  return normalizedDebt.times(currentInterestAccumulator).div(BASE_PARAMS.times(BASE_TOKENS))
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
    return MAX_UINT256
  }
  return collateral.times(collateralFactor.times(oracleValue)).div(debt.times(collateralBase))
}
