import { ethereum, BigInt, store } from '@graphprotocol/graph-ts'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { Harvested, RemoveLender, Strategy } from '../../generated/templates/StrategyTemplate/Strategy'
import { StableMaster } from '../../generated/templates/StrategyTemplate/StableMaster'
import { _updateGainPoolData, _updatePoolData } from './utils'
import { BASE_PARAMS } from '../../../constants'
import { ERC20 } from '../../generated/templates/StrategyTemplate/ERC20'
import { Lender } from '../../generated/templates/StrategyTemplate/Lender'
import { StrategyData, StrategyHistoricalData, LenderData } from '../../generated/schema'
import { historicalSlice } from './utils'

export function handleHarvest(event: Harvested): void {
  const strategy = Strategy.bind(event.address)
  const poolManager = PoolManager.bind(strategy.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const agToken = ERC20.bind(stableMaster.agToken())
  const token = ERC20.bind(poolManager.token())
  const stableName = agToken.symbol()
  const collatName = token.symbol()
  const strat = poolManager.strategies(strategy._address)
  const managerAddress = strategy.poolManager().toHexString()

  const resultAPR = strategy.try_estimatedAPR()
  const apr = resultAPR.reverted ? BigInt.fromString('0') : resultAPR.value
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

  // update strategy data
  const id = event.address.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(event.block)
  const idHistorical = event.address.toHexString() + '_' + roundedTimestamp.toHexString()
  const estimatedTotalAssets = strategy.estimatedTotalAssets()

  let stratData = StrategyData.load(id)
  if (stratData == null) {
    stratData = new StrategyData(id)
  }
  stratData.poolManager = managerAddress
  stratData.stableName = stableName
  stratData.collatName = collatName
  stratData.estimatedTotalAssets = estimatedTotalAssets
  stratData.decimals = BigInt.fromI32(token.decimals())
  stratData.debtRatio = strat.value2
  stratData.managerBalance = poolManager.getBalance()
  stratData.totalAsset = poolManager.getTotalAsset()
  stratData.apr = apr
  stratData.timestamp = strat.value0

  let stratDataHistorical = StrategyHistoricalData.load(idHistorical)
  if (stratDataHistorical == null) {
    stratDataHistorical = new StrategyHistoricalData(idHistorical)
    stratDataHistorical.poolManager = managerAddress
    stratDataHistorical.stableName = stableName
    stratDataHistorical.collatName = collatName
    stratDataHistorical.decimals = BigInt.fromI32(token.decimals())
    stratDataHistorical.estimatedTotalAssets = estimatedTotalAssets
    stratDataHistorical.debtRatio = strat.value2
    stratDataHistorical.managerBalance = poolManager.getBalance()
    stratDataHistorical.totalAsset = poolManager.getTotalAsset()
    stratDataHistorical.apr = apr
    stratDataHistorical.timestamp = strat.value0
  }

  stratData.save()
  stratDataHistorical.save()

  // if the strategy doesn't have sub jobs via lender --> lender entity will be empty
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
      let lendData = LenderData.load(id)
      if (lendData == null) {
        lendData = new LenderData(id)
      }
      lendData.strategy = event.address.toHexString()
      lendData.name = lender.lenderName()
      lendData.nav = lender.nav()
      lendData.apr = lender.apr()
      lendData.save()
    }
  }
}

export function handleLenderRemoved(event: RemoveLender): void {
  store.remove('LenderData', event.params.lender.toHexString())
}