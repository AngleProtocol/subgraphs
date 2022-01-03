import {
  CapitalGain,
  agToken,
  sanToken,
  externalToken,
  GaugeRewardData,
  GaugeRewardHistoricalData
} from '../../generated/schema'
import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import { SanToken } from '../../generated/templates/LiquidityGaugeTemplate/SanToken'
import { ERC20 } from '../../generated/templates/LiquidityGaugeTemplate/ERC20'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { SushiLPToken } from '../../generated/templates/LiquidityGaugeTemplate/SushiLPToken'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { StableMaster } from '../../generated/templates/LiquidityGaugeTemplate/StableMaster'
import { historicalSlice } from './utils'
import { BASE_TOKENS } from '../../../constants'
import {
  LiquidityGauge,
  Transfer,
  RewardDataUpdate
} from '../../generated/templates/LiquidityGaugeTemplate/LiquidityGauge'

function isBurn(event: Transfer): boolean {
  return event.params._to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function isMint(event: Transfer): boolean {
  return event.params._from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function updateGaugeData(event: RewardDataUpdate): void {
  const stakingRewardsContract = LiquidityGauge.bind(event.address)
  const block = event.block
  const timestamp = block.timestamp

  const token = event.params._token
  const gaugeId = event.address.toHexString()
  const id = gaugeId + '_' + token.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

  let data = GaugeRewardData.load(id)
  if (data == null) {
    data = new GaugeRewardData(id)
  }

  const rewardData = stakingRewardsContract.reward_data(token)
  const distributor = rewardData.value1.toHexString()
  const periodFinish = rewardData.value2
  const rewardRate = rewardData.value3
  const lastUpdateTime = rewardData.value4
  const totalSupply = stakingRewardsContract.totalSupply()
  const workingSupply = stakingRewardsContract.working_supply()

  data.gauge = gaugeId
  data.token = token.toHexString()
  data.distributor = distributor
  data.periodFinish = periodFinish
  data.rewardRate = rewardRate
  data.lastUpdateTime = lastUpdateTime
  data.totalSupply = totalSupply
  data.workingSupply = workingSupply
  data.blockNumber = block.number
  data.timestamp = timestamp

  let dataHistorical = GaugeRewardHistoricalData.load(idHistoricalHour)
  if (dataHistorical == null) {
    dataHistorical = new GaugeRewardHistoricalData(idHistoricalHour)
    dataHistorical.gauge = gaugeId
    dataHistorical.token = token.toHexString()
    dataHistorical.distributor = distributor
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.workingSupply = workingSupply
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  } else {
    dataHistorical.distributor = distributor
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.workingSupply = workingSupply
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  }

  data.save()
  dataHistorical.save()
}

export function updateGaugeSupplyData(event: ethereum.Event): void {
  const stakingRewardsContract = LiquidityGauge.bind(event.address)
  const block = event.block
  const timestamp = block.timestamp

  // common values
  const gaugeId = event.address.toHexString()
  const totalSupply = stakingRewardsContract.totalSupply()
  const workingSupply = stakingRewardsContract.working_supply()

  const rewardCount = parseInt(stakingRewardsContract.reward_count().toString())
  for (let i = 0; i < rewardCount; i++) {
    const token = stakingRewardsContract.reward_tokens(BigInt.fromString(i.toString()))
    const id = gaugeId + '_' + token.toHexString()
    // we round to the closest hour
    const roundedTimestamp = historicalSlice(block)
    const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

    let data = GaugeRewardData.load(id)
    if (data == null) {
      data = new GaugeRewardData(id)
    }

    data.gauge = gaugeId
    data.token = token.toHexString()
    data.totalSupply = totalSupply
    data.workingSupply = workingSupply
    data.blockNumber = block.number
    data.timestamp = timestamp

    let dataHistorical = GaugeRewardHistoricalData.load(idHistoricalHour)
    if (dataHistorical == null) {
      dataHistorical = new GaugeRewardHistoricalData(idHistoricalHour)
      dataHistorical.gauge = gaugeId
      dataHistorical.token = token.toHexString()
      dataHistorical.totalSupply = totalSupply
      dataHistorical.workingSupply = workingSupply
      dataHistorical.blockNumber = block.number
      dataHistorical.timestamp = roundedTimestamp
    } else {
      dataHistorical.totalSupply = totalSupply
      dataHistorical.workingSupply = workingSupply
      dataHistorical.blockNumber = block.number
      dataHistorical.timestamp = roundedTimestamp
    }

    data.save()
    dataHistorical.save()
  }
}

export function handleUpdatePerpStaking(event: ethereum.Event): void {
  const stakingRewardsContract = PerpetualManagerFront.bind(event.address)
  const block = event.block
  const timestamp = block.timestamp

  const id = event.address.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

  let data = GaugeRewardData.load(id)
  if (data == null) {
    data = new GaugeRewardData(id)
  }

  const token = stakingRewardsContract.rewardToken().toHexString()
  const periodFinish = stakingRewardsContract.periodFinish()
  const rewardRate = stakingRewardsContract.rewardRate()
  const lastUpdateTime = stakingRewardsContract.lastUpdateTime()
  const totalSupply = stakingRewardsContract.totalHedgeAmount()
  const rewardsDistributor = stakingRewardsContract.rewardsDistribution().toHexString()

  data.gauge = id
  data.token = token
  data.periodFinish = periodFinish
  data.distributor = rewardsDistributor
  data.rewardRate = rewardRate
  data.lastUpdateTime = lastUpdateTime
  data.totalSupply = totalSupply
  data.blockNumber = block.number
  data.timestamp = timestamp

  let dataHistorical = GaugeRewardHistoricalData.load(idHistoricalHour)
  if (dataHistorical == null) {
    dataHistorical = new GaugeRewardHistoricalData(idHistoricalHour)
    dataHistorical.gauge = id
    dataHistorical.token = token
    dataHistorical.periodFinish = periodFinish
    dataHistorical.distributor = rewardsDistributor
    dataHistorical.rewardRate = rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  } else {
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.distributor = rewardsDistributor
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  }

  data.save()
  dataHistorical.save()
}

export function handleStaked(token: Address, event: Transfer): void {
  const tokenDataId = event.params._to.toHexString() + '_' + token.toHexString()

  const sanTokenContract = SanToken.bind(token)
  const result = sanTokenContract.try_poolManager()
  let name = ERC20.bind(token).name()

  // In this case the staked token is a AgToken
  if (result.reverted) {
    if (name.substr(0, 2) == 'ag') {
      let data = agToken.load(tokenDataId)
      if (data == null) {
        data = new agToken(tokenDataId)
        data.stableName = name
        data.balance = BigInt.fromString('0')
        data.owner = event.params._to.toHexString()
        data.token = token.toHexString()
        data.staked = event.params._value
      } else {
        data.staked = data.staked.plus(event.params._value)
      }
      data.save()
    } else {
      let data = externalToken.load(tokenDataId)
      if (data == null) {
        data = new externalToken(tokenDataId)
        if (name.split(' ')[0] == 'SushiSwap' || name.split(' ')[0] == 'Uniswap V2') {
          name = `${name} ${ERC20.bind(SushiLPToken.bind(token).token0()).symbol()}/${ERC20.bind(
            SushiLPToken.bind(token).token1()
          ).symbol()}`
        }
        data.name = name
        data.balance = ERC20.bind(token).balanceOf(event.params._to)
        data.owner = event.params._to.toHexString()
        data.token = token.toHexString()
        data.staked = event.params._value
      } else {
        data.staked = data.staked.plus(event.params._value)
      }
      data.save()
    }

    // In this case the staked token is a SanToken
  } else {
    const poolManager = PoolManager.bind(result.value)
    const stableMaster = StableMaster.bind(poolManager.stableMaster())
    const collatToken = ERC20.bind(poolManager.token())

    // Read names and sanRate
    const stableName = ERC20.bind(stableMaster.agToken()).symbol()
    const collatName = collatToken.symbol()
    const sanRate = stableMaster.collateralMap(poolManager._address).value5

    let data = sanToken.load(tokenDataId)

    const addressId = event.params._to.toHexString() + '_' + collatName + '_' + stableName.substr(2)
    // Balance of staked tokens before the call
    const balance = data == null ? BigInt.fromString('0') : data.staked
    const lastStakedPosition = balance
      .plus(event.params._value)
      .times(sanRate)
      .div(BASE_TOKENS)

    const gainData = CapitalGain.load(addressId)!
    gainData.gains = gainData.gains.plus(balance.times(sanRate).div(BASE_TOKENS)).minus(gainData.lastStakedPosition)
    gainData.lastStakedPosition = lastStakedPosition

    gainData.save()

    if (data == null) {
      data = new sanToken(tokenDataId)
      data.owner = event.params._to.toHexString()
      data.token = token.toHexString()
      data.balance = BigInt.fromString('0')
      data.collatName = collatName
      data.stableName = stableName
      data.staked = event.params._value
    } else {
      data.staked = data.staked.plus(event.params._value)
    }
    data.save()
  }
}

export function handleUnstaked(token: Address, event: Transfer): void {
  const tokenDataId = event.params._from.toHexString() + '_' + token.toHexString()

  const sanTokenContract = SanToken.bind(token)
  const result = sanTokenContract.try_poolManager()

  const symbol = ERC20.bind(token).name()

  // In this case the staked token is a AgToken
  if (result.reverted) {
    if (symbol.substr(0, 2) == 'ag') {
      const data = agToken.load(tokenDataId)!
      data.staked = data.staked.minus(event.params._value)
      data.save()
    } else {
      const data = externalToken.load(tokenDataId)!
      // For external tokens we don't want to track there actual balance but just the what is goingthrough on the protocol
      // Otherwise this would asks to track all the other tokens when entering/exiting/transferring
      data.balance = data.balance.minus(event.params._value)
      data.staked = data.staked.minus(event.params._value)
      data.save()
    }
  } else {
    // In this case the staked token is a SanToken
    const poolManager = PoolManager.bind(result.value)
    const stableMaster = StableMaster.bind(poolManager.stableMaster())
    const collatToken = ERC20.bind(poolManager.token())

    // Read names and sanRate
    const stableName = ERC20.bind(stableMaster.agToken()).symbol()
    const collatName = collatToken.symbol()
    const sanRate = stableMaster.collateralMap(poolManager._address).value5

    const data = sanToken.load(tokenDataId)!

    const addressId = event.params._from.toHexString() + '_' + collatName + '_' + stableName.substr(2)
    // Balance of staked tokens before the call
    const balance = data.staked
    const lastStakedPosition = balance
      .minus(event.params._value)
      .times(sanRate)
      .div(BASE_TOKENS)

    const gainData = CapitalGain.load(addressId)!
    gainData.gains = gainData.gains.plus(balance.times(sanRate).div(BASE_TOKENS)).minus(gainData.lastStakedPosition)
    gainData.lastStakedPosition = lastStakedPosition
    gainData.save()

    data.staked = data.staked.minus(event.params._value)
    data.save()
  }
}

export function handleTransfer(event: Transfer): void {
  if (event.params._value.equals(BigInt.fromString('0'))) return

  const liquidityGaugeContract = LiquidityGauge.bind(event.address)
  const token = liquidityGaugeContract.lp_token()

  if (!isBurn(event)) {
    handleStaked(token, event)
  }
  if (!isMint(event)) {
    handleUnstaked(token, event)
  }
}
