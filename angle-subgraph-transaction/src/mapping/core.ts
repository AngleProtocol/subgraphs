import { StableMasterTemplate } from '../../generated/templates'
import { StableMasterDeployed } from '../../generated/Core/Core'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'

import { updateStableData } from './utils'
import { FeeData } from '../../generated/schema'

export function handleStableMasterDeployed(event: StableMasterDeployed): void {
  // Start indexing and tracking new contracts
  StableMasterTemplate.create(event.params._stableMaster)

  const stableMaster = StableMaster.bind(event.params._stableMaster)
  updateStableData(stableMaster, event.block)

  // Start indexing global fees
  const data = new FeeData('0')
  data.blockNumber = event.block.number
  data.timestamp = event.block.timestamp
  data.save()
}
