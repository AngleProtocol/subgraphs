import { Transfer } from '../../generated/templates/SanTokenTemplate/ERC20'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { SanToken } from '../../generated/templates/SanTokenTemplate/SanToken'

import { updateOracleData } from './utils'

// This file is not used to track any user action, but to keep track of oracle values and aprs
// Whenever someone interacts with the protocol all periphery values linked to the pool manager are updated

export function handleTransfer(event: Transfer): void {
  // Bind contracts
  const SanTokenCo = SanToken.bind(event.address)
  const poolManager = PoolManager.bind(SanTokenCo.poolManager())

  updateOracleData(poolManager, event.block)
}
