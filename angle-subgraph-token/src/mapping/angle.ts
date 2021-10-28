import { Address, BigInt, store } from '@graphprotocol/graph-ts'
import { Transfer } from '../../generated/Angle/ERC20Votes'
import { ANGLE } from '../../generated/schema'

export function handleTransfer(event: Transfer): void {
  const fromId = event.params.from.toHexString()
  const toId = event.params.to.toHexString()
  if (event.params.value.gt(BigInt.fromString('0'))) {
    if (event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))) {
      const data = ANGLE.load(fromId)!
      if (data.balance.equals(event.params.value)) {
        store.remove('ANGLE', fromId)
      } else {
        data.balance = data.balance.minus(event.params.value)
        data.save()
      }
    } else if (event.params.from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))) {
      const toId = event.params.to.toHexString()
      let data = ANGLE.load(toId)
      if (data == null) {
        data = new ANGLE(toId)
        data.balance = event.params.value
      } else {
        data.balance = data.balance.plus(event.params.value)
      }
      data.save()
    } else {
      const fromData = ANGLE.load(fromId)!
      fromData.balance = fromData.balance.minus(event.params.value)
      fromData.save()
      let toData = ANGLE.load(toId)
      if (toData == null) {
        toData = new ANGLE(toId)
        toData.balance = event.params.value
      } else {
        toData.balance = toData.balance.plus(event.params.value)
      }
      toData.save()
    }
  }
}
