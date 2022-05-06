import { AgTokenTemplate } from '../../generated/templates'
import { StableMasterDeployed } from '../../generated/Core/Core'

import { log } from '@graphprotocol/graph-ts'

export function handleStableMasterDeployed(event: StableMasterDeployed): void {
  log.warning('+++++ core: {}, {}', [event.address.toHexString(), event.params._agToken.toHexString()])
  // Start indexing and tracking new contracts
  AgTokenTemplate.create(event.params._agToken)
}
