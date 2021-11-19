import { StrategyAdded } from '../../generated/templates/ERCManagerFrontTemplate/PoolManager'
import { StrategyTemplate } from '../../generated/templates'

export function handleStrategyAdded(event: StrategyAdded): void {
  StrategyTemplate.create(event.params.strategy)
}
