import { VaultManagerTemplate } from '../../generated/templates'
import { VaultManagerToggled } from '../../generated/templates/TreasuryTemplate/Treasury'

export function handleVaultManagerToggled(event: VaultManagerToggled): void {
  // Start indexing and tracking new contracts
  VaultManagerTemplate.create(event.params.vaultManager)
}
