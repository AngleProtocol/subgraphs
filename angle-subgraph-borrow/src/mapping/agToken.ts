import { TreasuryUpdated, MinterToggled } from '../../generated/AgTokenTemplate/AgToken'
import { TreasuryTemplate } from '../../generated/templates'
import { TreasuryData } from '../../generated/schema'
import { _initTreasury } from './treasuryHelpers'

import { log } from '@graphprotocol/graph-ts'

export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  log.warning('+++++ TreasuryUpdated for agToken:{}, treasury:{}', [event.address.toHexString(), event.params._treasury.toHexString()])

  // Try to load existing treasury for this agToken, and update it
  const id = event.params._treasury.toHexString()
  let data = TreasuryData.load(id)
  if (data == null) {
    // Start indexing and tracking new contracts if it's a new one
    TreasuryTemplate.create(event.params._treasury)
    _initTreasury(event.params._treasury, event.block)
  }
}

export function handleMinterToggled(event: MinterToggled): void {
  // Load vaultManager and kill it by setting its treasury to 0x00..00 ?
}
