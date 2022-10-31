import { AgTokenTemplate } from '../../generated/templates'
import { StableMasterTemplate } from '../../generated/templates'
import { StableMasterDeployed } from '../../generated/Core/Core'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'

import { historicalSlice, updateStableData } from './utils'
import { FeeData, FeeHistoricalData } from '../../generated/schema'

export function handleStableMasterDeployed(event: StableMasterDeployed): void {
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
