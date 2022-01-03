import { Contracts, FeeDistribution } from '../../generated/schema'
import { FeeDistributorTemplate } from '../../generated/templates'
import { FeeDistributorUpdated } from '../../generated/templates/BaseSurplusConverterTemplate/BaseSurplusConverter'
import { FeeDistributor } from '../../generated/templates/BaseSurplusConverterTemplate/FeeDistributor'

export function handleUpdateFeeDistributor(event: FeeDistributorUpdated): void {
  const newFeeDistributorAddress = event.params.newFeeDistributor
  // Start indexing and tracking new contracts
  FeeDistributorTemplate.create(newFeeDistributorAddress)

  const contractData = new Contracts(newFeeDistributorAddress.toHexString())
  contractData.save()

  const feeDistributor = FeeDistributor.bind(newFeeDistributorAddress)
  const data = new FeeDistribution(newFeeDistributorAddress.toHexString())
  data.token = feeDistributor.token().toHexString()
  data.lastTokenTime = feeDistributor.last_token_time()
  data.blockNumber = event.block.number
  data.save()
}
