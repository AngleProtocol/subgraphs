import { store, BigInt } from '@graphprotocol/graph-ts'
import { TreasuryUpdated, MinterToggled } from '../../generated/templates/AgTokenTemplate/AgToken'
import { TreasuryData  } from '../../generated/schema'
import { TreasuryTemplate } from '../../generated/templates'


export function handleTreasuryUpdated(event: TreasuryUpdated): void {
    // Try to load existing treasury for this agToken, and update it

    // Start indexing and tracking new contracts if it's a new one
    TreasuryTemplate.create(event.params._treasury)

    // Can we tell thegraph to stop monitoring previous treasury contract?
}

export function handleMinterToggled(event: MinterToggled): void {
    // Load vaultManager and kill it by setting its treasury to 0x00..00 ?
}