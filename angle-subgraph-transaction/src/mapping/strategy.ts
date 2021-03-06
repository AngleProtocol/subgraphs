import { BigInt } from '@graphprotocol/graph-ts'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { Harvested, Strategy } from '../../generated/templates/StrategyTemplate/Strategy'
import { StableMaster } from '../../generated/templates/StrategyTemplate/StableMaster'
import { _updateGainPoolData, _updatePoolData } from './utils'
import { BASE_PARAMS } from '../../../constants'

export function handleHarvest(event: Harvested): void {
  const strategy = Strategy.bind(event.address)
  const poolManager = PoolManager.bind(strategy.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const percentInterestsForSLPs = collatData.value7.interestsForSLPs

  let interestSLPs: BigInt
  let interestProtocol: BigInt
  const result = poolManager.try_interestsForSurplus()
  if (result.reverted) {
    interestSLPs = event.params.profit.times(percentInterestsForSLPs).div(BASE_PARAMS)
    interestProtocol = event.params.profit.minus(interestSLPs)
  } else {
    const interestForSurplus = result.value
    interestSLPs = event.params.profit
      .times(BASE_PARAMS.minus(interestForSurplus))
      .times(percentInterestsForSLPs)
      .div(BASE_PARAMS)
      .div(BASE_PARAMS)
    interestProtocol = event.params.profit
      .times(BASE_PARAMS.minus(interestForSurplus))
      .times(BASE_PARAMS.minus(percentInterestsForSLPs))
      .div(BASE_PARAMS)
      .div(BASE_PARAMS)
  }

  const data = _updatePoolData(poolManager, event.block)
  data.save()
  _updateGainPoolData(
    poolManager,
    event.block,
    BigInt.fromString('0'),
    BigInt.fromString('0'),
    BigInt.fromString('0'),
    interestProtocol,
    interestSLPs
  )
}
