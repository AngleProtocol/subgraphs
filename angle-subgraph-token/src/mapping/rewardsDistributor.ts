import { BigInt, store } from '@graphprotocol/graph-ts'
import { DeletedStakingContract, NewStakingContract } from '../../generated/RewardsDistributor/RewardsDistributor'
import { StakingRewards } from '../../generated/RewardsDistributor/StakingRewards'
import { PerpetualManagerFront } from '../../generated/RewardsDistributor/PerpetualManagerFront'
import { StakingData, StakingHistoricalData } from '../../generated/schema'
import { StakingRewardsTemplate, PerpetualStakingRewardsTemplate } from '../../generated/templates'
import { historicalSlice } from './utils'

export function handleStakingContract(event: NewStakingContract): void {
  const block = event.block
  const totalSupply = BigInt.fromString('0')
  const timestamp = block.timestamp

  let address: string
  let periodFinish: BigInt
  let rewardRate: BigInt
  let rewardsDuration: BigInt
  let lastUpdateTime: BigInt
  let rewardPerTokenStored: BigInt
  let rewardsDistributor: string

  if (!StakingRewards.bind(event.params._stakingContract).try_totalSupply().reverted) {
    const stakingRewardsContract = StakingRewards.bind(event.params._stakingContract)
    // Start indexing and tracking new contracts
    StakingRewardsTemplate.create(event.params._stakingContract)
    address = stakingRewardsContract._address.toHexString()
    periodFinish = stakingRewardsContract.periodFinish()
    rewardRate = stakingRewardsContract.rewardRate()
    rewardsDuration = stakingRewardsContract.rewardsDuration()
    lastUpdateTime = stakingRewardsContract.lastUpdateTime()
    rewardPerTokenStored = stakingRewardsContract.rewardPerTokenStored()
    rewardsDistributor = stakingRewardsContract.rewardsDistribution().toHexString()
  } else {
    const perpStakingRewardsContract = PerpetualManagerFront.bind(event.params._stakingContract)
    // Start indexing and tracking new contracts
    PerpetualStakingRewardsTemplate.create(event.params._stakingContract)
    address = perpStakingRewardsContract._address.toHexString()
    periodFinish = perpStakingRewardsContract.periodFinish()
    rewardRate = perpStakingRewardsContract.rewardRate()
    rewardsDuration = perpStakingRewardsContract.rewardsDuration()
    lastUpdateTime = perpStakingRewardsContract.lastUpdateTime()
    rewardPerTokenStored = perpStakingRewardsContract.rewardPerTokenStored()
    rewardsDistributor = perpStakingRewardsContract.rewardsDistribution().toHexString()
  }

  const id = address

  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = address + '_hour_' + roundedTimestamp.toString()

  const data = new StakingData(id)
  const dataHistorical = new StakingHistoricalData(idHistoricalHour)

  dataHistorical.address = address

  data.periodFinish = periodFinish
  dataHistorical.periodFinish = periodFinish

  data.rewardRate = rewardRate
  dataHistorical.rewardRate = rewardRate

  data.totalSupply = totalSupply
  dataHistorical.totalSupply = totalSupply

  data.rewardsDuration = rewardsDuration
  dataHistorical.rewardsDuration = rewardsDuration

  data.lastUpdateTime = lastUpdateTime
  dataHistorical.lastUpdateTime = lastUpdateTime

  data.rewardPerTokenStored = rewardPerTokenStored
  dataHistorical.rewardPerTokenStored = rewardPerTokenStored

  data.rewardsDistributor = rewardsDistributor
  dataHistorical.rewardsDistributor = rewardsDistributor

  data.timestamp = timestamp
  dataHistorical.blockNumber = block.number
  dataHistorical.timestamp = roundedTimestamp

  data.save()
  dataHistorical.save()
}

export function handleDeleteStakingContract(event: DeletedStakingContract): void {
  const id = event.params.stakingContract
  store.remove('StakingData', id.toHexString())
}
