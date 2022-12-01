import { store, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  Treasury,
  BadDebtUpdated,
  SurplusBufferUpdated,
  SurplusForGovernanceUpdated,
  SurplusManagerUpdated,
  VaultManagerToggled,
  NewTreasurySet
} from '../../generated/templates/TreasuryTemplate/Treasury'
import { AgToken } from '../../generated/templates/TreasuryTemplate/AgToken'
import { TreasuryData, VaultManagerData, VaultManagerList } from '../../generated/schema'
import { _initTreasury, _addTreasuryDataToHistory, extractArray } from './treasuryHelpers'
import { _initVaultManager, _addVaultManagerDataToHistory, _addVaultDataToHistory } from './vaultManagerHelpers'
import { log } from '@graphprotocol/graph-ts'
import { VaultManager } from '../../generated/templates/TreasuryTemplate/VaultManager'
import { Oracle } from '../../generated/templates/StableMasterTemplate/Oracle'
import { getToken, _trackNewChainlinkOracle } from './utils'
import { convertTokenToDecimal } from '../utils'
import { DECIMAL_PARAMS } from '../../../constants'

export function handleBadDebtUpdated(event: BadDebtUpdated): void {
  log.warning('++++ BadDebtUpdated', [])
  let data = TreasuryData.load(event.address.toHexString())!
  const agToken = AgToken.bind(Address.fromString(data.agToken))
  const agTokenInfo = getToken(agToken._address)
  data.badDebt = convertTokenToDecimal(event.params.badDebtValue, agTokenInfo.decimals)
  data.surplus = convertTokenToDecimal(agToken.balanceOf(event.address), agTokenInfo.decimals)

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data, event.block)
}

export function handleSurplusBufferUpdated(event: SurplusBufferUpdated): void {
  log.warning('++++ SurplusBufferUpdated', [])
  const treasury = Treasury.bind(event.address)
  const agToken = AgToken.bind(treasury.stablecoin())
  const agTokenInfo = getToken(agToken._address)
  let data = TreasuryData.load(event.address.toHexString())!
  if (event.params.surplusBufferValue.isZero() && treasury.badDebt().isZero()) {
    // Surplus moving to zero and badDebt == 0 means we just flushed some surplus to governance
    const newProfits = data.surplusBuffer.times(data.surplusForGovernance)
    data.governanceProfits = data.governanceProfits.plus(newProfits)
  }
  data.surplusBuffer = convertTokenToDecimal(event.params.surplusBufferValue, agTokenInfo.decimals)
  // looks like a good time to update treasury's surplus
  data.surplus = convertTokenToDecimal(agToken.balanceOf(event.address), agTokenInfo.decimals)

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data, event.block)
}

export function handleSurplusForGovernanceUpdated(event: SurplusForGovernanceUpdated): void {
  log.warning('++++ SurplusForGovernanceUpdated', [])
  let data = TreasuryData.load(event.address.toHexString())!
  data.surplusForGovernance = convertTokenToDecimal(event.params._surplusForGovernance, DECIMAL_PARAMS)

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data, event.block)
}

export function handleSurplusManagerUpdated(event: SurplusManagerUpdated): void {
  log.warning('++++ SurplusManagerUpdated', [])
  let data = TreasuryData.load(event.address.toHexString())!
  data.surplusManager = event.params._surplusManager.toHexString()

  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number
  data.save()
  _addTreasuryDataToHistory(data, event.block)
}

export function handleVaultManagerToggled(event: VaultManagerToggled): void {
  log.warning('++++ VaultManagerToggled:{}', [event.params.vaultManager.toHexString()])

  let dataTreasury = TreasuryData.load(event.address.toHexString())!
  dataTreasury.timestamp = event.block.timestamp
  dataTreasury.blockNumber = event.block.number
  dataTreasury.save()
  _addTreasuryDataToHistory(dataTreasury, event.block)

  const vaultManager = VaultManager.bind(event.params.vaultManager)
  const oracle = Oracle.bind(vaultManager.oracle())
  _trackNewChainlinkOracle(oracle, event.block.timestamp)

  let data = VaultManagerData.load(event.params.vaultManager.toHexString())
  if (data == null) {
    _initVaultManager(event.params.vaultManager, event.block)

    // Add new VM to the VM list
    const listVM = VaultManagerList.load('1')!
    let vaultManagers = listVM.vaultManagers
    vaultManagers.push(event.params.vaultManager.toHexString())
    listVM.vaultManagers = vaultManagers
    listVM.save()
  }
}

// We use this event only to update vaultManagers entities
export function handleNewTreasurySet(event: NewTreasurySet): void {
  log.warning('++++ NewTreasurySet', [])

  const treasury = Treasury.bind(event.address)
  const vaultManagers = extractArray(treasury, treasury.try_vaultManagerList)

  for (let i = 0; i < vaultManagers.length; i++) {
    let data = VaultManagerData.load(vaultManagers[i].toHexString())!
    data.treasury = event.params._treasury.toHexString()
    data.timestamp = event.block.timestamp
    data.blockNumber = event.block.number
    data.save()
    _addVaultManagerDataToHistory(data, event.block, null)
  }
}
