import {
  CheckpointToken,
  Claimed,
  FeeDistributor
} from '../../generated/templates/FeeDistributorTemplate/FeeDistributor'
import { FeeDistribution, FeesEarned, WeeklyDistribution } from '../../generated/schema'
import { DECIMAL_TOKENS, WEEK } from '../../../constants'
import { SanToken } from '../../generated/templates/SanTokenTemplate/SanToken'
import { Address } from '@graphprotocol/graph-ts'
import { PoolManager } from '../../generated/templates/ERCManagerFrontTemplate/PoolManager'
import { StableMaster } from '../../generated/Core/StableMaster'
import { convertTokenToDecimal } from '../utils'
import { getToken } from './utils'

/// @notice Keeps track of all revenue earned by a veANGLE owner since genesis
export function handleClaim(event: Claimed): void {
  let feeDistributionData = FeeDistribution.load(event.address.toHexString())!
  const rewardToken = feeDistributionData.token
  const owner = event.params.recipient.toHexString()
  const rewardInfo = getToken(Address.fromString(rewardToken))
  const earned = convertTokenToDecimal(event.params.amount, rewardInfo.decimals)

  const id = owner + '_' + rewardToken
  let data = FeesEarned.load(id)
  if (data == null) {
    data = new FeesEarned(id)
    data.owner = owner
    data.token = rewardToken
    data.earned = earned
  } else {
    data.earned = data.earned.plus(earned)
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

  let curWeek = lastTokenTime

  while (curWeek.lt(upToWeek)) {
    const id = event.address.toHexString() + '_' + curWeek.toString()

    let data = WeeklyDistribution.load(id)
    if (data == null) {
      data = new WeeklyDistribution(id)
      data.feeDistributor = event.address.toHexString()
      data.week = curWeek
    }

    const sanTokenAddress = Address.fromString(feeDistributionData.token)
    let tokenInfo = getToken(sanTokenAddress);

    const sanToken = SanToken.bind(sanTokenAddress)
    const poolManagerAddress = sanToken.poolManager()
    const poolManager = PoolManager.bind(poolManagerAddress)
    const stableMaster = StableMaster.bind(poolManager.stableMaster())
    const resultPool = stableMaster.collateralMap(poolManagerAddress)
    let sanRateDecimal = convertTokenToDecimal(resultPool.value5, DECIMAL_TOKENS)
    let tokensPerWeekDecimal = convertTokenToDecimal(feeDistributor
      .tokens_per_week(curWeek), tokenInfo.decimals)

    data.distributed = tokensPerWeekDecimal
      .times(sanRateDecimal)
    data.save()
    curWeek = curWeek.plus(WEEK)
  }

  // update the lastTokenTime, to not redo the work twice
  feeDistributionData.lastTokenTime = feeDistributor.last_token_time()
  feeDistributionData.save()
}
