import { Transfer } from '../../generated/templates/SanTokenTemplate/ERC20'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { SanToken } from '../../generated/templates/SanTokenTemplate/SanToken'

import { updateOracleData } from './utils'

export function handleTransfer(event: Transfer): void {
  // Bind contracts
  const SanTokenCo = SanToken.bind(event.address)
  const poolManager = PoolManager.bind(SanTokenCo.poolManager())

  updateOracleData(poolManager, event.block)
}
