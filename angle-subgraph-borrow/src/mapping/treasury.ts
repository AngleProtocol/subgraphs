import { store, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import { VaultManagerTemplate } from '../../generated/templates'
import {
  Treasury,
  BadDebtUpdated,
  SurplusBufferUpdated,
  SurplusForGovernanceUpdated,
  SurplusManagerUpdated,
  VaultManagerToggled
} from '../../generated/TreasuryTemplate/Treasury'
import { AgToken } from '../../generated/TreasuryTemplate/AgToken'
import { TreasuryData, TreasuryHistoricalData } from '../../generated/schema'
import { _updateTreasury, _updateVaultManager } from './utils'
import { log } from '@graphprotocol/graph-ts'

export function handleBadDebtUpdated(event: BadDebtUpdated): void {
  log.warning('+', [])
  _updateTreasury(event.address, event.block)
}
export function handleSurplusBufferUpdated(event: SurplusBufferUpdated): void {
  log.warning('++', [])
  _updateTreasury(event.address, event.block)
}
export function handleSurplusForGovernanceUpdated(event: SurplusForGovernanceUpdated): void {
  log.warning('+_+', [])
  _updateTreasury(event.address, event.block)
}
export function handleSurplusManagerUpdated(event: SurplusManagerUpdated): void {
  log.warning('++++', [])
  _updateTreasury(event.address, event.block)
}

export function handleVaultManagerToggled(event: VaultManagerToggled): void {
  log.warning('+_+_+', [])
  _updateTreasury(event.address, event.block)

  // Start indexing and tracking new contracts
  VaultManagerTemplate.create(event.params.vaultManager)
  _updateVaultManager(event.params.vaultManager, event.block)
}
