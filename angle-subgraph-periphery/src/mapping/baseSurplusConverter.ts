import { BigInt } from '@graphprotocol/graph-ts'
import { Contracts, FeeDistribution } from '../../generated/schema'
import { FeeDistributorTemplate } from '../../generated/templates'
import { FeeDistributorUpdated } from '../../generated/templates/BaseSurplusConverterTemplate/BaseSurplusConverter'
import { FeeDistributor } from '../../generated/templates/BaseSurplusConverterTemplate/FeeDistributor'
import { ERC20 } from '../../generated/templates/BaseSurplusConverterTemplate/ERC20'

export function handleUpdateFeeDistributor(event: FeeDistributorUpdated): void {
  const newFeeDistributorAddress = event.params.newFeeDistributor
  const feeDistributor = FeeDistributor.bind(newFeeDistributorAddress)
  // if this is actually a surplusConverter revert
  const call = feeDistributor.try_last_token_time()
  if (call.reverted) return

  let data = FeeDistribution.load(newFeeDistributorAddress.toHexString())
  // if the entity doesn't already exists
  if (data == null) {
    // Start indexing and tracking new contracts
    FeeDistributorTemplate.create(newFeeDistributorAddress)

    const contractData = new Contracts(newFeeDistributorAddress.toHexString())
    contractData.save()

    const tokenAddress = feeDistributor.token()
    const rewardToken = ERC20.bind(tokenAddress)

    const data = new FeeDistribution(newFeeDistributorAddress.toHexString())
    data.token = tokenAddress.toHexString()
    data.tokenName = rewardToken.name()
    data.tokenDecimals = BigInt.fromI32(rewardToken.decimals())
    data.lastTokenTime = feeDistributor.last_token_time()
    data.blockNumber = event.block.number
    data.save()
  }
}
