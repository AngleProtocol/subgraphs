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
  FeeDistributorTemplate.create(originalFeeDistributorAddress)

  const feeDistributor = FeeDistributor.bind(originalFeeDistributorAddress)
  const data = new FeeDistribution(originalFeeDistributorAddress.toHexString())
  data.token = feeDistributor.token().toHexString()
  data.lastTokenTime = feeDistributor.last_token_time()
  data.blockNumber = event.block.number
  data.save()

  contractData = new Contracts(originalFeeDistributorAddress.toHexString())
  contractData.save()
}
