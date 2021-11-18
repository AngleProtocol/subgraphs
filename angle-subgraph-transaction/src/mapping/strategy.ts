import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { ERC20 } from '../../generated/templates/StrategyTemplate/ERC20'
import { Harvested, Strategy } from '../../generated/templates/StrategyTemplate/Strategy'
import { StableMaster } from '../../generated/templates/StrategyTemplate/StableMaster'

export function handleHarvest(event: Harvested): void {
  const strategy = Strategy.bind(event.address)
  const poolManager = PoolManager.bind(strategy.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const agToken = ERC20.bind(stableMaster.agToken())
  const token = ERC20.bind(poolManager.token())
}
