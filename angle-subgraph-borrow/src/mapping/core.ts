import { AgTokenTemplate } from '../../generated/templates'
import { StableMasterDeployed } from '../../generated/Core/Core'

import { log } from '@graphprotocol/graph-ts'
import { FeeData } from '../../generated/schema'

export function handleStableMasterDeployed(event: StableMasterDeployed): void {
  log.warning('+++++ core: {}, {}', [event.address.toHexString(), event.params._agToken.toHexString()])
  // Start indexing and tracking new contracts
  AgTokenTemplate.create(event.params._agToken)

  // Start indexing global fees
  const data = new FeeData('0')
  data.blockNumber = event.block.number
  data.timestamp = event.block.timestamp
  data.save()
}
