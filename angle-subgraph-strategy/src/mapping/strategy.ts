import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { ERC20 } from '../../generated/templates/StrategyTemplate/ERC20'
import { Lender } from '../../generated/templates/StrategyTemplate/Lender'
import { Strategy } from '../../generated/templates/StrategyTemplate/Strategy'
import { StableMaster } from '../../generated/templates/StrategyTemplate/StableMaster'
import { StrategyData, StrategyHistoricalData, LenderData } from '../../generated/schema'
import { historicalSlice } from './utils'

export function handleHarvest(event: ethereum.Event): void {
  const strategy = Strategy.bind(event.address)
  const poolManager = PoolManager.bind(strategy.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const agToken = ERC20.bind(stableMaster.agToken())
  const token = ERC20.bind(poolManager.token())
  const stableName = agToken.symbol()
  const collatName = token.symbol()
  const strat = poolManager.strategies(strategy._address)
  const apr = strategy.estimatedAPR()
  const managerAddress = strategy.poolManager().toHexString()

  const id = event.address.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(event.block)
  const idHistorical = event.address.toHexString() + '_' + roundedTimestamp.toHexString()
  const estimatedTotalAssets = strategy.estimatedTotalAssets()

  let data = StrategyData.load(id)
  if (data == null) {
    data = new StrategyData(id)
  }
  data.poolManager = managerAddress
  data.stableName = stableName
  data.collatName = collatName
  data.decimals = BigInt.fromI32(token.decimals())
  data.debtRatio = strat.value2
  data.managerBalance = poolManager.getBalance()
  data.totalAsset = poolManager.getTotalAsset()
  data.apr = apr
  data.timestamp = strat.value0

  let dataHistorical = StrategyHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new StrategyHistoricalData(idHistorical)
    dataHistorical.poolManager = managerAddress
    dataHistorical.stableName = stableName
    dataHistorical.collatName = collatName
    dataHistorical.decimals = BigInt.fromI32(token.decimals())
    dataHistorical.estimatedTotalAssets = estimatedTotalAssets
    dataHistorical.debtRatio = strat.value2
    dataHistorical.managerBalance = poolManager.getBalance()
    dataHistorical.totalAsset = poolManager.getTotalAsset()
    dataHistorical.apr = apr
    dataHistorical.timestamp = strat.value0
  }

  data.save()
  dataHistorical.save()

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
      data.strategy = event.address.toHexString()
      data.name = lender.lenderName()
      data.nav = lender.nav()
      data.apr = lender.apr()
      data.save()
    }
  }
}
