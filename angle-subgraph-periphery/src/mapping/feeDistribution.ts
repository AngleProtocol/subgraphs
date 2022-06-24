import {
  CheckpointToken,
  Claimed,
  FeeDistributor
} from '../../generated/templates/FeeDistributorTemplate/FeeDistributor'
import { FeeDistribution, FeesEarned, WeeklyDistribution } from '../../generated/schema'
import { WEEK } from '../../../constants'

/// @notice Keeps track of all revenue earned by a veANGLE owner since genesis
export function handleClaim(event: Claimed): void {
  const feeDistributor = FeeDistributor.bind(event.address)
  const rewardToken = feeDistributor.token().toHexString()
  const owner = event.params.recipient.toHexString()

  const id = owner + '_' + rewardToken
  let data = FeesEarned.load(id)
  if (data == null) {
    data = new FeesEarned(id)
    data.owner = owner
    data.token = rewardToken
    data.earned = event.params.amount
  } else {
    data.earned = data.earned.plus(event.params.amount)
  }

  data.save()
}

/// @notice It will fill all weeks revenue distribution since genesis by
/// tracking the event CheckpointToken
export function handleCheckpoint(event: CheckpointToken): void {
  let feeDistributionData = FeeDistribution.load(event.address.toHexString())!
  const feeDistributor = FeeDistributor.bind(event.address)

  const lastTokenTime = feeDistributionData.lastTokenTime.div(WEEK).times(WEEK)
  const upToWeek = event.block.timestamp
    .plus(WEEK)
    .div(WEEK)
    .times(WEEK)

  const weekElapsed = lastTokenTime
    .minus(upToWeek)
    .div(WEEK)
    .toI32()

  let curWeek = lastTokenTime

  while (curWeek.lt(upToWeek)) {
    const id = event.address.toHexString() + '_' + curWeek.toString()

    let data = WeeklyDistribution.load(id)
    if (data == null) {
      data = new WeeklyDistribution(id)
      data.feeDistributor = event.address.toHexString()
      data.week = curWeek
    }

    data.distributed = feeDistributor.tokens_per_week(curWeek)

    data.save()
    curWeek = curWeek.plus(WEEK)
  }

  // update the lastTokenTime, to not redo the work twice
  feeDistributionData.lastTokenTime = feeDistributor.last_token_time()
  feeDistributionData.save()
}
