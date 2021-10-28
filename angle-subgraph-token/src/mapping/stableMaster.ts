import { CollateralDeployed } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { SanTokenTemplate } from '../../generated/templates'
import { Contracts } from '../../generated/schema'

export function handleCollateralDeployed(event: CollateralDeployed): void {
  // Start indexing and tracking new contracts
  SanTokenTemplate.create(event.params._sanToken)

  let contractData = new Contracts(event.params._perpetualManager.toHexString())
  contractData.save()

  contractData = new Contracts(event.params._poolManager.toHexString())
  contractData.save()
}
