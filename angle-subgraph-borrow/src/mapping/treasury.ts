import { store, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  Treasury,
  BadDebtUpdated,
  SurplusBufferUpdated,
  SurplusForGovernanceUpdated,
  SurplusManagerUpdated,
  VaultManagerToggled,
  NewTreasurySet
} from '../../generated/TreasuryTemplate/Treasury'
import { AgToken } from '../../generated/TreasuryTemplate/AgToken'
import { TreasuryData, VaultManagerData } from '../../generated/schema'
import { _initTreasury, _addTreasuryDataToHistory, extractArray } from './treasuryHelpers'
import {
  _initVaultManager,
  _addVaultManagerDataToHistory,
  _addVaultDataToHistory,
  _addVaultManagerRevenueToHistory
} from './vaultManagerHelpers'
import { historicalSlice } from './utils'
import { log } from '@graphprotocol/graph-ts'

export function handleBadDebtUpdated(event: BadDebtUpdated): void {
  log.warning('++++ BadDebtUpdated', [])
  let data = TreasuryData.load(event.address.toHexString())!
  const agToken = AgToken.bind(Address.fromString(data.agToken))
  data.badDebt = event.params.badDebtValue
  data.surplus = agToken.balanceOf(event.address)

  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data)
}

export function handleSurplusBufferUpdated(event: SurplusBufferUpdated): void {
  log.warning('++++ SurplusBufferUpdated', [])
  const treasury = Treasury.bind(event.address)
  const agToken = AgToken.bind(treasury.stablecoin())
  let data = TreasuryData.load(event.address.toHexString())!
  if (event.params.surplusBufferValue.isZero() && treasury.badDebt().isZero()) {
    // Surplus moving to zero and badDebt == 0 means we just flushed some surplus to governance
    const newProfits = data.surplusBuffer.times(data.surplusForGovernance).div(BigInt.fromString('1000000000'))
    data.governanceProfits = data.governanceProfits.plus(newProfits)
  }
  data.surplusBuffer = event.params.surplusBufferValue
  // looks like a good time to update treasury's surplus
  data.surplus = agToken.balanceOf(event.address)

  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data)
}

export function handleSurplusForGovernanceUpdated(event: SurplusForGovernanceUpdated): void {
  log.warning('++++ SurplusForGovernanceUpdated', [])
  let data = TreasuryData.load(event.address.toHexString())!
  data.surplusForGovernance = event.params._surplusForGovernance

  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data)
}

export function handleSurplusManagerUpdated(event: SurplusManagerUpdated): void {
  log.warning('++++ SurplusManagerUpdated', [])
  let data = TreasuryData.load(event.address.toHexString())!
  data.surplusManager = event.params._surplusManager.toHexString()

  data.timestamp = historicalSlice(event.block)
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data)
}

export function handleVaultManagerToggled(event: VaultManagerToggled): void {
  log.warning('++++ VaultManagerToggled', [])

  let dataTreasury = TreasuryData.load(event.address.toHexString())
  // THIS IS ONLY FOR RINKEBY BECAUSE WE CAN'T TREASURY DEPLOYMENT
  if (dataTreasury == null) {
    _initTreasury(event.address, event.block)
  } else {
    // END OF RINKEBY CODE
    dataTreasury.timestamp = historicalSlice(event.block)
    dataTreasury.blockNumber = event.block.number
    dataTreasury.save()
    _addTreasuryDataToHistory(dataTreasury)
  }

  let data = VaultManagerData.load(event.params.vaultManager.toHexString())
  if (data == null) {
    _initVaultManager(event.params.vaultManager, event.block)
  } else {
    data.timestamp = historicalSlice(event.block)
    data.blockNumber = event.block.number
    data.save()
    _addVaultManagerDataToHistory(data)
  }
}

// We use this event only to update vaultManagers entities
export function handlehandleNewTreasurySet(event: NewTreasurySet): void {
  log.warning('++++ NewTreasurySet', [])

  const treasury = Treasury.bind(event.address)
  const vaultManagers = extractArray(treasury, treasury.try_vaultManagerList)

  for (let i = 0; i < vaultManagers.length; i++) {
    let data = VaultManagerData.load(vaultManagers[i].toHexString())!
    data.treasury = event.params._treasury.toHexString()
    data.timestamp = historicalSlice(event.block)
    data.blockNumber = event.block.number
    data.save()
    _addVaultManagerDataToHistory(data)
  }
}