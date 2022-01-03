import { Contracts, FeeDistribution } from '../../generated/schema'
import { FeeDistributorTemplate } from '../../generated/templates'
import { FeeDistributorUpdated } from '../../generated/templates/BaseSurplusConverterTemplate/BaseSurplusConverter'
import { FeeDistributor } from '../../generated/templates/BaseSurplusConverterTemplate/FeeDistributor'

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

    const data = new FeeDistribution(newFeeDistributorAddress.toHexString())
    data.token = feeDistributor.token().toHexString()
    data.lastTokenTime = feeDistributor.last_token_time()
    data.blockNumber = event.block.number
    data.save()
  }
}
