import { TreasuryTemplate } from '../../generated/templates'
import { FeeData, FeeHistoricalData, TreasuryData, VaultManagerList } from '../../generated/schema'
import { _initTreasury } from './treasuryHelpers'

import { log } from '@graphprotocol/graph-ts'
import { TreasuryUpdated, MinterToggled } from '../../generated/templates/AgTokenTemplate/AgToken'
import { historicalSlice } from './utils'

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

  // should be put in core borrow init
  let listVM = VaultManagerList.load("1")
  if (listVM == null) {
    let listVM = new VaultManagerList("1")
    listVM.vaultManagers = []
    listVM.save()
  }

  // Start indexing global fees
  let feeData = FeeData.load('0')
  if (feeData == null) {
    feeData = new FeeData('0')
    const feeDataHistorical = new FeeHistoricalData(historicalSlice(event.block).toString())
    feeData.blockNumber = event.block.number
    feeData.timestamp = event.block.timestamp
    feeDataHistorical.timestamp = event.block.timestamp
    feeDataHistorical.blockNumber = event.block.number

    feeData.save()
    feeDataHistorical.save()
  }
}

export function handleMinterToggled(event: MinterToggled): void {
  // Load vaultManager and kill it by setting its treasury to 0x00..00 ?
  log.warning('++++ MinterToggled', [])
}