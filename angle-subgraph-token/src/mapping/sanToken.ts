import { Address, store, BigInt } from '@graphprotocol/graph-ts'
import { Transfer } from '../../generated/Angle/ERC20Votes'
import { sanToken, CapitalGain } from '../../generated/schema'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { ERC20 } from '../../generated/templates/SanTokenTemplate/ERC20'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { SanToken } from '../../generated/templates/SanTokenTemplate/SanToken'

import { BASE_TOKENS } from '../../../constants'

function isBurn(event: Transfer): boolean {
  return event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function isMint(event: Transfer): boolean {
  return event.params.from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

// @notice Track balances and earned interest of sanToken holders
export function handleTransfer(event: Transfer): void {
  // Do nothing if the transfer is void
  if (event.params.value.equals(BigInt.fromString('0'))) return

  // Bind contracts
  const SanTokenCo = SanToken.bind(event.address)
  const poolManager = PoolManager.bind(SanTokenCo.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const token = ERC20.bind(poolManager.token())

  // Read names and sanRate
  const stableName = ERC20.bind(stableMaster.agToken()).symbol()
  const collatName = token.symbol()

  const sanRate = stableMaster.collateralMap(poolManager._address).value5

  // Tx to address + contract address
  const toId = event.params.to.toHexString() + '_' + event.address.toHexString()
  // Tx from address + contract address
  const fromId = event.params.from.toHexString() + '_' + event.address.toHexString()
  //  Tx to address + pool name
  const addressToId = event.params.to.toHexString() + '_' + collatName + '_' + stableName.substr(2)
  //  Tx from address + pool name
  const addressFromId = event.params.from.toHexString() + '_' + collatName + '_' + stableName.substr(2)

  let data: sanToken | null
  let gainData: CapitalGain | null

  if (!isMint(event)) {
    data = sanToken.load(fromId)!
    gainData = CapitalGain.load(addressFromId)!

    // In the lastPosition we store the value of sanToken after the transfer
    const lastPosition = data.balance
      .minus(event.params.value)
      .times(sanRate)
      .div(BASE_TOKENS)
    // In the gains we store the gains since last time this address was seen
    gainData.gains = gainData.gains.plus(data.balance.times(sanRate).div(BASE_TOKENS)).minus(gainData.lastPosition)
    gainData.lastPosition = lastPosition
    gainData.save()

    // Store the updated balance
    data.balance = data.balance.minus(event.params.value)

    // If the address as no more tokens or staked token, remove the entity
    if (data.balance.equals(BigInt.fromString('0')) && data.staked.equals(BigInt.fromString('0'))) {
      store.remove('sanToken', fromId)
    } else {
      data.save()
    }
  }

  if (!isBurn(event)) {
    data = sanToken.load(toId)
    gainData = CapitalGain.load(addressToId)

    const balance = data == null ? BigInt.fromString('0') : data.balance
    // In the lastPosition we store the value of sanToken after the transfer
    const lastPosition = balance
      .plus(event.params.value)
      .times(sanRate)
      .div(BASE_TOKENS)

    if (gainData == null) {
      gainData = new CapitalGain(addressToId)
      gainData.gains = BigInt.fromString('0')
      gainData.lastStakedPosition = BigInt.fromString('0')
    } else {
      gainData.gains = gainData.gains.plus(balance.times(sanRate).div(BASE_TOKENS)).minus(gainData.lastPosition)
    }
    gainData.lastPosition = lastPosition
    gainData.save()

    // If this address currently has no entity
    if (data == null) {
      data = new sanToken(toId)
      data.owner = event.params.to.toHexString()
      data.token = event.address.toHexString()
      data.balance = event.params.value
      data.collatName = collatName
      data.stableName = stableName
      data.staked = BigInt.fromString('0')
    } else {
      data.balance = data.balance.plus(event.params.value)
    }
    data.save()
  }
}
