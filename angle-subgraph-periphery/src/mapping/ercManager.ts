import { Contracts, FeeDistribution } from '../../generated/schema'
import { BaseSurplusConverterTemplate, FeeDistributorTemplate } from '../../generated/templates'
import { BaseSurplusConverter } from '../../generated/templates/ERCManagerFrontTemplate/BaseSurplusConverter'
import { FeeDistributor } from '../../generated/templates/ERCManagerFrontTemplate/FeeDistributor'
import { SurplusConverterUpdated } from '../../generated/templates/ERCManagerFrontTemplate/PoolManager'

export function handleUpdateSurplusConverter(event: SurplusConverterUpdated): void {
  // Start indexing and tracking new contracts
  BaseSurplusConverterTemplate.create(event.params.newSurplusConverter)

  let contractData = new Contracts(event.params.newSurplusConverter.toHexString())
  contractData.save()

  // create directly the FeeDistributor linked at contract creation
  const surplusConverter = BaseSurplusConverter.bind(event.params.newSurplusConverter)
  const originalFeeDistributorAddress = surplusConverter.feeDistributor()
  const feeDistributor = FeeDistributor.bind(originalFeeDistributorAddress)
  // if this is actually a surplusConverter revert
  const call = feeDistributor.try_last_token_time()
  if (call.reverted) return

  let data = FeeDistribution.load(originalFeeDistributorAddress.toHexString())
  // if the entity doesn't already exists
  if (data == null) {
    FeeDistributorTemplate.create(originalFeeDistributorAddress)

    contractData = new Contracts(originalFeeDistributorAddress.toHexString())
    contractData.save()

    data = new FeeDistribution(originalFeeDistributorAddress.toHexString())
    data.token = feeDistributor.token().toHexString()
    data.lastTokenTime = feeDistributor.last_token_time()
    data.blockNumber = event.block.number
    data.save()
  }
}
