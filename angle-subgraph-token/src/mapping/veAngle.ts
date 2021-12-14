import { BigInt, store } from '@graphprotocol/graph-ts'
import { MAX_LOCK_TIME } from '../../../constants'
import { veANGLE } from '../../generated/schema'
import { Deposit, Withdraw } from '../../generated/veAngle/veANGLE'

export function handleDeposit(event: Deposit): void {
  const toId = event.params.provider.toHexString()
  const timestamp = event.params.ts
  const amount = event.params.value
  const locktime = event.params.locktime
  const type = event.params.type

  // deposit / create / extend
  if (type.equals(BigInt.fromString('0')) || type.equals(BigInt.fromString('2'))) {
    let data = veANGLE.load(toId)!
    data.amount = data.amount.plus(amount)
    if (data.locked.ge(timestamp)) {
      data.slope = data.amount.div(MAX_LOCK_TIME)
      data.bias = data.slope.times(data.locked.minus(timestamp))
    } else {
      data.slope = BigInt.fromString('0')
      data.bias = BigInt.fromString('0')
    }
    data.lastUpdate = timestamp
    data.save()
  } else if (type.equals(BigInt.fromString('1'))) {
    let data = new veANGLE(toId)
    data.lastUpdate = timestamp
    data.slope = amount.div(MAX_LOCK_TIME)
    data.bias = data.slope.times(locktime.minus(timestamp))
    data.locked = locktime
    data.amount = amount
    data.save()
  } else {
    let data = veANGLE.load(toId)!
    data.slope = data.amount.div(MAX_LOCK_TIME)
    data.bias = data.slope.times(locktime.minus(timestamp))
    data.locked = locktime
    data.lastUpdate = timestamp
    data.save()
  }
}

export function handleWithdraw(event: Withdraw): void {
  const timestamp = event.params.ts
  const toId = event.params.provider.toHexString()
  let data = veANGLE.load(toId)!
  data.lastUpdate = timestamp
  data.slope = BigInt.fromString('0')
  data.bias = BigInt.fromString('0')
  data.locked = BigInt.fromString('0')
  data.amount = BigInt.fromString('0')
  data.save()
  // or just remove the datapoint
  // store.remove('veANGLE', toId)
}
