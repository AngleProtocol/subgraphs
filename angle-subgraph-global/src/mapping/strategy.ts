import { BigInt, store, BigDecimal, Address } from '@graphprotocol/graph-ts'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { Harvested, RemoveLender, Strategy } from '../../generated/templates/StrategyTemplate/Strategy'
import { _updateGainPoolData, _updatePoolData } from './utilsCore'
import { DECIMAL_PARAMS, DECIMAL_TOKENS, ONE_BD, ZERO_BD } from '../../../constants'
import { Lender } from '../../generated/templates/StrategyTemplate/Lender'
import { StrategyData, StrategyHistoricalData, LenderData, PoolData } from '../../generated/schema'
import { historicalSlice, getToken } from './utils'
import { convertTokenToDecimal } from '../utils'

export function handleHarvest(event: Harvested): void {
  const strategy = Strategy.bind(event.address)
  const poolManager = PoolManager.bind(strategy.poolManager())
  let dataPool = PoolData.load(poolManager._address.toHexString())!
  const stablecoinInfo = getToken(Address.fromString(dataPool.stablecoin))
  const collateralInfo = getToken(Address.fromString(dataPool.collateral))
  const stableName = stablecoinInfo.symbol
  const collatName = collateralInfo.symbol
  const strat = poolManager.strategies(strategy._address)
  const managerAddress = strategy.poolManager().toHexString()

  const resultAPR = strategy.try_estimatedAPR()
  const apr = resultAPR.reverted ? ZERO_BD : convertTokenToDecimal(resultAPR.value, DECIMAL_TOKENS)
  const percentInterestsForSLPs = dataPool.interestsForSLPs

  let interestSLPs: BigDecimal
  let interestProtocol: BigDecimal
  const profit = convertTokenToDecimal(event.params.profit, collateralInfo.decimals)
  const result = poolManager.try_interestsForSurplus()
  if (result.reverted) {
    interestSLPs = profit.times(percentInterestsForSLPs)
    interestProtocol = profit.minus(interestSLPs)
  } else {
    const interestForSurplus = convertTokenToDecimal(result.value, DECIMAL_PARAMS)
    interestSLPs = profit
      .times(ONE_BD.minus(interestForSurplus))
      .times(percentInterestsForSLPs)
    interestProtocol = profit
      .times(ONE_BD.minus(interestForSurplus))
      .times(ONE_BD.minus(percentInterestsForSLPs))
  }

  const data = _updatePoolData(poolManager, event.block)
  data.save()
  _updateGainPoolData(
    poolManager,
    event.block,
    ZERO_BD,
    ZERO_BD,
    ZERO_BD,
    interestProtocol,
    interestSLPs
  )

  // update strategy data
  const id = event.address.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(event.block)
  const idHistorical = event.address.toHexString() + '_' + roundedTimestamp.toHexString()
  const estimatedTotalAssets = convertTokenToDecimal(strategy.estimatedTotalAssets(), collateralInfo.decimals)
  const debtRatio = convertTokenToDecimal(strat.value2, DECIMAL_PARAMS)
  const managerBalance = convertTokenToDecimal(poolManager.getBalance(), collateralInfo.decimals)
  const totalAsset = convertTokenToDecimal(poolManager.getTotalAsset(), collateralInfo.decimals)

  let stratData = StrategyData.load(id)
  if (stratData == null) {
    stratData = new StrategyData(id)
  }
  stratData.poolManager = managerAddress
  stratData.stableName = stableName
  stratData.collatName = collatName
  stratData.estimatedTotalAssets = estimatedTotalAssets
  stratData.decimals = collateralInfo.decimals
  stratData.debtRatio = debtRatio
  stratData.managerBalance = managerBalance
  stratData.totalAsset = totalAsset
  stratData.apr = apr
  stratData.timestamp = strat.value0

  let stratDataHistorical = StrategyHistoricalData.load(idHistorical)
  if (stratDataHistorical == null) {
    stratDataHistorical = new StrategyHistoricalData(idHistorical)
    stratDataHistorical.poolManager = managerAddress
    stratDataHistorical.stableName = stableName
    stratDataHistorical.collatName = collatName
    stratDataHistorical.decimals = collateralInfo.decimals
    stratDataHistorical.estimatedTotalAssets = estimatedTotalAssets
    stratDataHistorical.debtRatio = debtRatio
    stratDataHistorical.managerBalance = managerBalance
    stratDataHistorical.totalAsset = totalAsset
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
      lendData.nav = convertTokenToDecimal(lender.nav(), collateralInfo.decimals)
      lendData.apr = convertTokenToDecimal(lender.apr(), DECIMAL_TOKENS)
      lendData.save()
    }
  }
}

export function handleLenderRemoved(event: RemoveLender): void {
  store.remove('LenderData', event.params.lender.toHexString())
}