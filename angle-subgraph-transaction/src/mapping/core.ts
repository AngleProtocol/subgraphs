import { StableMasterTemplate } from '../../generated/templates'
import { StableMasterDeployed } from '../../generated/Core/Core'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'

import { updateStableData } from './utils'

export function handleStableMasterDeployed(event: StableMasterDeployed): void {
  // Start indexing and tracking new contracts
  StableMasterTemplate.create(event.params._stableMaster)

  const stableMaster = StableMaster.bind(event.params._stableMaster)
  updateStableData(stableMaster, event.block)
}
