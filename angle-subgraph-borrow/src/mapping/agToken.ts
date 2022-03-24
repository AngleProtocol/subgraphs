import { store, BigInt } from '@graphprotocol/graph-ts'
import { AgToken, TreasuryUpdated, MinterToggled } from '../../generated/templates/AgTokenTemplate/AgToken'
import { Treasury } from '../../generated/templates/TreasuryTemplate/Treasury'
import { TreasuryData, TreasuryHistoricalData } from '../../generated/schema'
// import { TreasuryTemplate } from '../../generated/templates'

import { log } from '@graphprotocol/graph-ts'

// export function handleTreasuryUpdated(event: TreasuryUpdated): void {
//   log.warning('+++++: {}, {}', [event.address.toString(), event.params._treasury.toString()])
//   const agToken = AgToken.bind(event.address)
//   const treasury = Treasury.bind(event.params._treasury)

//   // Try to load existing treasury for this agToken, and update it
//   const id = event.address.toHexString()
//   const idHistorical = id + event.block.timestamp.toString()
//   let data = TreasuryData.load(id)
//   if (data == null) {
//     // Start indexing and tracking new contracts if it's a new one
//     TreasuryTemplate.create(event.params._treasury)
//     data = new TreasuryData(id)
//   } else {
//     // Can we tell thegraph to stop monitoring previous treasury contract?
//   }

//   // Fetch values
//   let treasuryAddress = event.params._treasury.toHexString()
//   let badDebt = treasury.badDebt()
//   let surplusBuffer = treasury.surplusBuffer()
//   let surplus = agToken.balanceOf(event.params._treasury).minus(data.surplusBuffer)
//   let surplusForGovernance = treasury.surplusForGovernance()
//   let surplusManager = treasury.surplusManager().toHexString()
//   let blockNumber = event.block.number
//   let timestamp = event.block.timestamp

//   // Fill data
//   data.treasury = treasuryAddress
//   data.badDebt = badDebt
//   data.surplusBuffer = surplusBuffer
//   data.surplus = surplus
//   data.surplusForGovernance = surplusForGovernance
//   data.surplusManager = surplusManager

//   data.blockNumber = blockNumber
//   data.timestamp = timestamp
//   data.save()

//   // Fill dataHistorical
//   let dataHistorical = TreasuryHistoricalData.load(idHistorical)
//   if (dataHistorical == null) {
//     dataHistorical = new TreasuryHistoricalData(idHistorical)
//   }

//   dataHistorical.treasury = treasuryAddress
//   dataHistorical.badDebt = badDebt
//   dataHistorical.surplusBuffer = surplusBuffer
//   dataHistorical.surplus = surplus
//   dataHistorical.surplusForGovernance = surplusForGovernance
//   dataHistorical.surplusManager = surplusManager

//   dataHistorical.blockNumber = blockNumber
//   dataHistorical.timestamp = timestamp
//   dataHistorical.save()
// }

export function handleMinterToggled(event: MinterToggled): void {
  // Load vaultManager and kill it by setting its treasury to 0x00..00 ?
}
