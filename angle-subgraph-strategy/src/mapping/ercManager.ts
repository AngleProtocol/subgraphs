import { BigInt } from '@graphprotocol/graph-ts'
import { PoolManager, StrategyAdded } from '../../generated/templates/ERCManagerFrontTemplate/PoolManager'
import { Strategy } from '../../generated/templates/ERCManagerFrontTemplate/Strategy'
import { Lender } from '../../generated/templates/ERCManagerFrontTemplate/Lender'
import { StrategyTemplate } from '../../generated/templates'
import { LenderData } from '../../generated/schema'
import { ERC20 } from '../../generated/templates/ERCManagerFrontTemplate/ERC20'
import { StrategyData } from '../../generated/schema'
import { StableMaster } from '../../generated/templates/ERCManagerFrontTemplate/StableMaster'

export function handleStrategyAdded(event: StrategyAdded): void {
  StrategyTemplate.create(event.params.strategy)
  const poolManager = PoolManager.bind(event.address)
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const strategy = Strategy.bind(event.params.strategy)
  const strat = poolManager.strategies(strategy._address)

  let stratData = StrategyData.load(event.params.strategy.toHexString())
  if (stratData == null) {
    stratData = new StrategyData(event.params.strategy.toHexString())
  }

  const managerAddress = strategy.poolManager().toHexString()
  stratData.poolManager = managerAddress

  const agToken = ERC20.bind(stableMaster.agToken())
  const token = ERC20.bind(poolManager.token())
  const stableName = agToken.symbol()
  const collatName = token.symbol()

  stratData.stableName = stableName
  stratData.collatName = collatName
  stratData.decimals = BigInt.fromI32(token.decimals())
  stratData.totalDebt = strat.value1
  stratData.debtRatio = strat.value2
  stratData.managerBalance = poolManager.getBalance()
  stratData.totalAsset = poolManager.getTotalAsset()
  stratData.apr = strategy.estimatedAPR()
  stratData.timestamp = strat.value0
  stratData.save()

  let i = 0
  let find = true
  while (find) {
    const result = strategy.try_lenders(BigInt.fromString(i.toString()))
    if (result.reverted) {
      find = false
    } else {
      i = i + 1
      const lenderAddress = result.value

      const lender = Lender.bind(lenderAddress)

      const id = lenderAddress.toHexString()
      let data = LenderData.load(id)
      if (data == null) {
        data = new LenderData(id)
      }
      data.strategy = event.params.strategy.toHexString()
      data.name = lender.lenderName()
      data.nav = lender.nav()
      data.apr = lender.apr()
      data.save()
    }
  }
}
