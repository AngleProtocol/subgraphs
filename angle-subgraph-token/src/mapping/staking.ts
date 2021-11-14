import {
  CapitalGain,
  StakingData,
  StakingHistoricalData,
  agToken,
  sanToken,
  externalToken
} from '../../generated/schema'
import { StakingRewards, Withdrawn, Staked } from '../../generated/RewardsDistributor/StakingRewards'
import { ethereum, BigInt } from '@graphprotocol/graph-ts'
import { SanToken } from '../../generated/templates/StakingRewardsTemplate/SanToken'
import { ERC20 } from '../../generated/templates/StakingRewardsTemplate/ERC20'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { SushiLPToken } from '../../generated/templates/StakingRewardsTemplate/SushiLPToken'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { StableMaster } from '../../generated/templates/StakingRewardsTemplate/StableMaster'
import { historicalSlice } from './utils'
import { BASE_TOKENS } from '../../../constants'

function updateStakingData(event: ethereum.Event): void {
  const stakingRewardsContract = StakingRewards.bind(event.address)
  const block = event.block

  const id = event.address.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

  let data = StakingData.load(id)
  if (data == null) {
    data = new StakingData(id)
  }

  const periodFinish = stakingRewardsContract.periodFinish()
  data.periodFinish = periodFinish

  const rewardRate = stakingRewardsContract.rewardRate()
  data.rewardRate = rewardRate

  const rewardsDuration = stakingRewardsContract.rewardsDuration()
  data.rewardsDuration = rewardsDuration

  const lastUpdateTime = stakingRewardsContract.lastUpdateTime()
  data.lastUpdateTime = lastUpdateTime

  const totalSupply = stakingRewardsContract.totalSupply()
  data.totalSupply = totalSupply

  const rewardPerTokenStored = stakingRewardsContract.rewardPerTokenStored()
  data.rewardPerTokenStored = rewardPerTokenStored

  const rewardsDistributor = stakingRewardsContract.rewardsDistribution().toHexString()
  data.rewardsDistributor = rewardsDistributor

  const timestamp = block.timestamp
  data.timestamp = timestamp

  let dataHistorical = StakingHistoricalData.load(idHistoricalHour)
  if (dataHistorical == null) {
    dataHistorical = new StakingHistoricalData(idHistoricalHour)
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.rewardsDuration = rewardsDuration
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.rewardPerTokenStored = rewardPerTokenStored
    dataHistorical.rewardsDistributor = rewardsDistributor
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  } else {
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.rewardsDuration = rewardsDuration
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.rewardPerTokenStored = rewardPerTokenStored
    dataHistorical.rewardsDistributor = rewardsDistributor
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  }

  data.save()
  dataHistorical.save()
}

export function handleUpdatePerpStaking(event: ethereum.Event): void {
  const stakingRewardsContract = PerpetualManagerFront.bind(event.address)
  const block = event.block

  const id = event.address.toHexString()
  // we round to the closest hour
  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

  let data = StakingData.load(id)
  if (data == null) {
    data = new StakingData(id)
  }

  const periodFinish = stakingRewardsContract.periodFinish()
  data.periodFinish = periodFinish

  const rewardRate = stakingRewardsContract.rewardRate()
  data.rewardRate = rewardRate

  const rewardsDuration = stakingRewardsContract.rewardsDuration()
  data.rewardsDuration = rewardsDuration

  const lastUpdateTime = stakingRewardsContract.lastUpdateTime()
  data.lastUpdateTime = lastUpdateTime

  const totalSupply = stakingRewardsContract.totalHedgeAmount()
  data.totalSupply = totalSupply

  const rewardPerTokenStored = stakingRewardsContract.rewardPerTokenStored()
  data.rewardPerTokenStored = rewardPerTokenStored

  const rewardsDistributor = stakingRewardsContract.rewardsDistribution().toHexString()
  data.rewardsDistributor = rewardsDistributor

  const timestamp = block.timestamp
  data.timestamp = timestamp

  let dataHistorical = StakingHistoricalData.load(idHistoricalHour)
  if (dataHistorical == null) {
    dataHistorical = new StakingHistoricalData(idHistoricalHour)
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.rewardsDuration = rewardsDuration
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.rewardPerTokenStored = rewardPerTokenStored
    dataHistorical.rewardsDistributor = rewardsDistributor
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  } else {
    dataHistorical.periodFinish = periodFinish
    dataHistorical.rewardRate = rewardRate
    dataHistorical.rewardsDuration = rewardsDuration
    dataHistorical.lastUpdateTime = lastUpdateTime
    dataHistorical.totalSupply = totalSupply
    dataHistorical.rewardPerTokenStored = rewardPerTokenStored
    dataHistorical.rewardsDistributor = rewardsDistributor
    dataHistorical.blockNumber = block.number
    dataHistorical.timestamp = roundedTimestamp
  }

  data.save()
  dataHistorical.save()
}

export function handleUpdateStaking(event: ethereum.Event): void {
  updateStakingData(event)
}

export function handleStaked(event: Staked): void {
  if (event.params.amount.equals(BigInt.fromString('0'))) return

  updateStakingData(event)

  const stakingRewardsContract = StakingRewards.bind(event.address)
  const token = stakingRewardsContract.stakingToken()

  const tokenDataId = event.params.user.toHexString() + '_' + token.toHexString()

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
        data.owner = event.params.user.toHexString()
        data.token = token.toHexString()
        data.staked = event.params.amount
      } else {
        data.staked = data.staked.plus(event.params.amount)
      }
      data.save()
    } else {
      let data = externalToken.load(tokenDataId)
      if (data == null) {
        data = new externalToken(tokenDataId)
        if (name.split(' ')[0] == 'SushiSwap') {
          name = `${name} ${ERC20.bind(SushiLPToken.bind(token).token0()).name()}/${ERC20.bind(
            SushiLPToken.bind(token).token1()
          ).name()} `
        }
        data.name = name
        data.balance = ERC20.bind(token).balanceOf(event.params.user)
        data.owner = event.params.user.toHexString()
        data.token = token.toHexString()
        data.staked = event.params.amount
      } else {
        data.staked = data.staked.plus(event.params.amount)
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

    const addressId = event.params.user.toHexString() + '_' + collatName + '_' + stableName.substr(2)
    // Balance of staked tokens before the call
    const balance = data == null ? BigInt.fromString('0') : data.staked
    const lastStakedPosition = balance
      .plus(event.params.amount)
      .times(sanRate)
      .div(BASE_TOKENS)

    const gainData = CapitalGain.load(addressId)!
    gainData.gains = gainData.gains.plus(balance.times(sanRate).div(BASE_TOKENS)).minus(gainData.lastStakedPosition)
    gainData.lastStakedPosition = lastStakedPosition

    gainData.save()

    if (data == null) {
      data = new sanToken(tokenDataId)
      data.owner = event.params.user.toHexString()
      data.token = token.toHexString()
      data.balance = BigInt.fromString('0')
      data.collatName = collatName
      data.stableName = stableName
      data.staked = event.params.amount
    } else {
      data.staked = data.staked.plus(event.params.amount)
    }
    data.save()
  }
}

export function handleWithdrawn(event: Withdrawn): void {
  if (event.params.amount.equals(BigInt.fromString('0'))) return
  updateStakingData(event)

  const stakingRewardsContract = StakingRewards.bind(event.address)
  const token = stakingRewardsContract.stakingToken()

  const tokenDataId = event.params.user.toHexString() + '_' + token.toHexString()

  const sanTokenContract = SanToken.bind(token)
  const result = sanTokenContract.try_poolManager()

  const symbol = ERC20.bind(token).name()

  // In this case the staked token is a AgToken
  if (result.reverted) {
    if (symbol.substr(0, 2) == 'ag') {
      const data = agToken.load(tokenDataId)!
      data.staked = data.staked.minus(event.params.amount)
      data.save()
    } else {
      const data = externalToken.load(tokenDataId)!
      data.balance = ERC20.bind(token).balanceOf(event.params.user)
      data.staked = data.staked.minus(event.params.amount)
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

    const addressId = event.params.user.toHexString() + '_' + collatName + '_' + stableName.substr(2)
    // Balance of staked tokens before the call
    const balance = data.staked
    const lastStakedPosition = balance
      .minus(event.params.amount)
      .times(sanRate)
      .div(BASE_TOKENS)

    const gainData = CapitalGain.load(addressId)!
    gainData.gains = gainData.gains.plus(balance.times(sanRate).div(BASE_TOKENS)).minus(gainData.lastStakedPosition)
    gainData.lastStakedPosition = lastStakedPosition
    gainData.save()

    data.staked = data.staked.minus(event.params.amount)
    data.save()
  }
}
