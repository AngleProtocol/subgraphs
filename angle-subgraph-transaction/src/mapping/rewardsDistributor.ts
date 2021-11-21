import { NewStakingContract } from '../../generated/RewardsDistributor/RewardsDistributor'
import { StakingRewards } from '../../generated/RewardsDistributor/StakingRewards'
import { StakingRewardsTemplate } from '../../generated/templates'

export function handleStakingContract(event: NewStakingContract): void {
  // Start indexing and tracking new contracts
  if (!StakingRewards.bind(event.params._stakingContract).try_totalSupply().reverted) {
    StakingRewardsTemplate.create(event.params._stakingContract)
  }
}
