import { store, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import { VaultManagerTemplate } from '../../generated/templates'
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
import { TreasuryData, TreasuryHistoricalData, VaultManagerData } from '../../generated/schema'
import { historicalSlice, _updateTreasury, _initVaultManager, _addVaultManagerDataToHistory } from './utils'
import { log } from '@graphprotocol/graph-ts'

export function handleBadDebtUpdated(event: BadDebtUpdated): void {
  log.warning('++++ BadDebtUpdated', [])
  _updateTreasury(event.address, event.block)
}
export function handleSurplusBufferUpdated(event: SurplusBufferUpdated): void {
  log.warning('++++ SurplusBufferUpdated', [])
  _updateTreasury(event.address, event.block)
}
export function handleSurplusForGovernanceUpdated(event: SurplusForGovernanceUpdated): void {
  log.warning('++++ SurplusForGovernanceUpdated', [])
  _updateTreasury(event.address, event.block)
}
export function handleSurplusManagerUpdated(event: SurplusManagerUpdated): void {
  log.warning('++++ SurplusManagerUpdated', [])
  _updateTreasury(event.address, event.block)
}

export function handleVaultManagerToggled(event: VaultManagerToggled): void {
  log.warning('++++ VaultManagerToggled', [])
  _updateTreasury(event.address, event.block)

  let data = VaultManagerData.load(event.params.vaultManager.toHexString())
  if (data == null) {
    // Start indexing and tracking new contracts
    VaultManagerTemplate.create(event.params.vaultManager)
    _initVaultManager(event.params.vaultManager, event.block)
  }
  else{
    data.mintingEnabled = !data.mintingEnabled
    data.timestamp = historicalSlice(event.block)
    data.blockNumber = event.block.number
    data.save()
    _addVaultManagerDataToHistory(data)
  }
}

function extractArray(thisArg: Treasury, getter: (this: Treasury, param0: BigInt) => ethereum.CallResult<Address>): Address[]{
  let array: Address[]
  for (let i = 0; i < getter.length; i++) {
    let result = getter.call(thisArg, BigInt.fromI32(i))
    if(result.reverted){
      break;
    }
    array.push(result.value)
  }
  return array
}

// We use this event only to update vaultManagers entities
export function handlehandleNewTreasurySet(event: NewTreasurySet): void {
  log.warning('++++ NewTreasurySet', [])

  const treasury = Treasury.bind(event.address)
  // extractArray<Treasury, Address>(treasury, treasury.vaultManagerList)
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