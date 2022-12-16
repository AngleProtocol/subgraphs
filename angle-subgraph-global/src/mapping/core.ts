import { log } from '@graphprotocol/graph-ts'
import { AgTokenTemplate } from '../../generated/templates'
import { StableMasterTemplate } from '../../generated/templates'
import { StableMasterDeployed } from '../../generated/Core/Core'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'

import { updateStableData } from './utilsCore'
import { FeeData, FeeHistoricalData } from '../../generated/schema'
import { historicalSlice } from './utils'

export function handleStableMasterDeployed(event: StableMasterDeployed): void {
  log.warning('+++++ core: {}, {}', [event.address.toHexString(), event.params._agToken.toHexString()])

  StableMasterTemplate.create(event.params._stableMaster)
  // Start indexing and tracking new contracts
  StableMasterTemplate.create(event.params._stableMaster)
  AgTokenTemplate.create(event.params._agToken)

  const stableMaster = StableMaster.bind(event.params._stableMaster)
  updateStableData(stableMaster, event.block)

  // Start indexing global fees
  const data = new FeeData('0')
  const feeDataHistorical = new FeeHistoricalData(historicalSlice(event.block).toString())
  data.blockNumber = event.block.number
  data.timestamp = event.block.timestamp
  feeDataHistorical.timestamp = event.block.timestamp
  feeDataHistorical.blockNumber = event.block.number

  data.save()
  feeDataHistorical.save()
}
