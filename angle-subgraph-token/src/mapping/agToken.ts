import { Address, store, BigInt } from '@graphprotocol/graph-ts'
import { Transfer } from '../../generated/Angle/ERC20Votes'
import { ERC20 } from '../../generated/templates/AgTokenTemplate/ERC20'
import { agToken as AgToken } from '../../generated/schema'

function isBurn(event: Transfer): boolean {
  return event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function isMint(event: Transfer): boolean {
  return event.params.from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function handleTransfer(event: Transfer): void {
  // Do nothing if the transfer is void
  if (event.params.value.equals(BigInt.fromString('0'))) return

  // Bind contracts
  const stableName = ERC20.bind(event.address).symbol()

  const toId = event.params.to.toHexString() + '_' + event.address.toHexString()
  const fromId = event.params.from.toHexString() + '_' + event.address.toHexString()

  let data: AgToken | null

  if (!isMint(event)) {
    data = AgToken.load(fromId)
    if (data != null) {
      data.balance = data.balance.minus(event.params.value)
      if (data.balance.equals(BigInt.fromString('0')) && data.staked.equals(BigInt.fromString('0'))) {
        store.remove('agToken', fromId)
      } else {
        data.save()
      }
    }
  }

  if (!isBurn(event)) {
    data = AgToken.load(toId)
    if (data == null) {
      data = new AgToken(toId)
      data.owner = event.params.to.toHexString()
      data.token = event.address.toHexString()
      data.stableName = stableName
      data.balance = event.params.value
      data.staked = BigInt.fromString('0')
    } else {
      data.balance = data.balance.plus(event.params.value)
    }
    data.save()
  }
}
