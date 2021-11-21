import { Stake, Unstake } from '../../generated/schema'
import { StakingRewards, Withdrawn, Staked } from '../../generated/RewardsDistributor/StakingRewards'
import { BigInt } from '@graphprotocol/graph-ts'
import { ERC20 } from '../../generated/templates/StakingRewardsTemplate/ERC20'

export function handleStaked(event: Staked): void {
  if (event.params.amount.equals(BigInt.fromString('0'))) return
  const stakingRewardsContract = StakingRewards.bind(event.address)
  const token = ERC20.bind(stakingRewardsContract.stakingToken())
  const decimals = token.decimals().toString()
  const name = token.name()
  const txId =
    event.transaction.hash.toHexString() + '_' + event.params.user.toHexString() + '_' + event.params.amount.toString()
  let txData = new Stake(txId)
  txData.transactionId = event.transaction.hash.toHexString()
  txData.amount = event.params.amount
  txData.decimals = decimals
  txData.sender = event.transaction.from.toHexString()
  txData.stakedToken = name
  txData.timestamp = event.block.timestamp
  txData.blockNumber = event.block.number
  txData.save()
}

export function handleWithdrawn(event: Withdrawn): void {
  if (event.params.amount.equals(BigInt.fromString('0'))) return
  const stakingRewardsContract = StakingRewards.bind(event.address)
  const token = ERC20.bind(stakingRewardsContract.stakingToken())
  const decimals = token.decimals().toString()
  const name = token.name()

  const txId =
    event.transaction.hash.toHexString() + '_' + event.params.user.toHexString() + '_' + event.params.amount.toString()
  let txData = new Unstake(txId)
  txData.transactionId = event.transaction.hash.toHexString()
  txData = new Unstake(txId)
  txData.amount = event.params.amount
  txData.decimals = decimals
  txData.sender = event.transaction.from.toHexString()
  txData.stakedToken = name
  txData.timestamp = event.block.timestamp
  txData.blockNumber = event.block.number

  txData.save()
}
