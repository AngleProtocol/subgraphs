import { CollateralDeployed } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERCManagerFrontTemplate } from '../../generated/templates'
import { Contracts } from '../../generated/schema'

export function handleCollateralDeployed(event: CollateralDeployed): void {
  // Start indexing and tracking new contracts
  ERCManagerFrontTemplate.create(event.params._poolManager)

  let contractData = new Contracts(event.params._poolManager.toHexString())
  contractData.save()
}
