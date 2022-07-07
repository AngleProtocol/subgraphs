import { Transfer } from '../../generated/templates/PerpetualManagerFrontTemplate/PerpetualManagerFront'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'

import { updateOracleData } from './utils'

// This file is not used to track any user action, but to keep track of oracle values and aprs
// Whenever someone interacts with the protocol all periphery values linked to the pool manager are updated

export function handleTransfer(event: Transfer): void {
  const PerpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(PerpetualManager.poolManager())
  updateOracleData(poolManager, event.block)
}
