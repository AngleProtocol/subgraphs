import { BigInt } from '@graphprotocol/graph-ts'
import { Contracts, FeeDistribution } from '../../generated/schema'
import { BaseSurplusConverterTemplate, FeeDistributorTemplate } from '../../generated/templates'
import { BaseSurplusConverter } from '../../generated/templates/ERCManagerFrontTemplate/BaseSurplusConverter'
import { FeeDistributor } from '../../generated/templates/ERCManagerFrontTemplate/FeeDistributor'
import { SurplusConverterUpdated } from '../../generated/templates/ERCManagerFrontTemplate/PoolManager'
import { ERC20 } from '../../generated/templates/ERCManagerFrontTemplate/ERC20'

/// @notice Function triggered when a new surplus converter is added
/// It links pool managers to the fee distributor
/// @dev It also have the responsibility to create the initial fee distributor entity
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

    const tokenAddress = feeDistributor.token()
    const rewardToken = ERC20.bind(tokenAddress)

    data = new FeeDistribution(originalFeeDistributorAddress.toHexString())
    data.token = tokenAddress.toHexString()
    data.tokenName = rewardToken.name()
    data.tokenDecimals = BigInt.fromI32(rewardToken.decimals())
    data.lastTokenTime = feeDistributor.last_token_time()
    data.blockNumber = event.block.number
    data.save()
  }
}
