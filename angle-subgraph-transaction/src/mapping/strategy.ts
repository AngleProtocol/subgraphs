import { BigInt } from '@graphprotocol/graph-ts'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { Harvested, Strategy } from '../../generated/templates/StrategyTemplate/Strategy'
import { StableMaster } from '../../generated/templates/StrategyTemplate/StableMaster'
import { _updateGainPoolData } from './utils'
import { BASE_PARAMS } from '../../../constants'

export function handleHarvest(event: Harvested): void {
  const strategy = Strategy.bind(event.address)
  const poolManager = PoolManager.bind(strategy.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const percentInterestsForSLPs = collatData.value7.interestsForSLPs
  const interestSLPs = event.params.profit.times(percentInterestsForSLPs).div(BASE_PARAMS)
  const interestProtocol = event.params.profit.minus(interestSLPs)
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
