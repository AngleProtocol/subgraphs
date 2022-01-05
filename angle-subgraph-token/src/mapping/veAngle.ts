import { BigInt } from '@graphprotocol/graph-ts'
import { MAX_LOCK_TIME } from '../../../constants'
import { lockedANGLEHistorical, veANGLE, veANGLEHistorical } from '../../generated/schema'
import { Deposit, Withdraw } from '../../generated/veAngle/veANGLE'
import { historicalSlice } from './utils'

export function handleDeposit(event: Deposit): void {
  const roundedTimestamp = historicalSlice(event.block)
  const timestamp = event.params.ts

  const toId = event.params.provider.toHexString()
  const idHistorical = event.params.provider.toHexString() + '_hour_' + timestamp.toString()
  const amount = event.params.value
  const locktime = event.params.locktime
  const type = event.params.type

  // keep track of the locked ANGLE
  const idLockedANGLEHistoricalHour = roundedTimestamp.toString()
  let dataHistoricalLockedANGLE = lockedANGLEHistorical.load(idLockedANGLEHistoricalHour)
  if (dataHistoricalLockedANGLE == null) {
    dataHistoricalLockedANGLE = new lockedANGLEHistorical(idLockedANGLEHistoricalHour)
    dataHistoricalLockedANGLE.locked = BigInt.fromString('0')
  }
  dataHistoricalLockedANGLE.locked = dataHistoricalLockedANGLE.locked.plus(amount)
  dataHistoricalLockedANGLE.timestamp = roundedTimestamp
  dataHistoricalLockedANGLE.save()

  // deposit / create / extend
  if (type.equals(BigInt.fromString('0')) || type.equals(BigInt.fromString('2'))) {
    let data = veANGLE.load(toId)!
    let dataHistorical = veANGLEHistorical.load(idHistorical)
    if (dataHistorical == null) {
      dataHistorical = new veANGLEHistorical(idHistorical)
      dataHistorical.endLocked = data.endLocked
    }

    data.amount = data.amount.plus(amount)
    dataHistorical.amount = data.amount.plus(amount)
    if (data.endLocked.ge(timestamp)) {
      data.slope = data.amount.div(MAX_LOCK_TIME)
      data.bias = data.slope.times(data.endLocked.minus(timestamp))
      dataHistorical.slope = data.amount.div(MAX_LOCK_TIME)
      dataHistorical.bias = data.slope.times(data.endLocked.minus(timestamp))
    } else {
      data.slope = BigInt.fromString('0')
      data.bias = BigInt.fromString('0')
      dataHistorical.slope = BigInt.fromString('0')
      dataHistorical.bias = BigInt.fromString('0')
    }
    data.lastUpdate = timestamp
    dataHistorical.timestamp = timestamp
    data.save()
  } else if (type.equals(BigInt.fromString('1'))) {
    let data = new veANGLE(toId)
    data.lastUpdate = timestamp
    data.slope = amount.div(MAX_LOCK_TIME)
    data.bias = data.slope.times(locktime.minus(timestamp))
    data.endLocked = locktime
    data.amount = amount
    data.save()

    let dataHistorical = veANGLEHistorical.load(idHistorical)
    if (dataHistorical == null) {
      dataHistorical = new veANGLEHistorical(idHistorical)
    }
    dataHistorical.timestamp = timestamp
    dataHistorical.slope = data.slope
    dataHistorical.bias = data.bias
    dataHistorical.endLocked = data.endLocked
    dataHistorical.amount = data.amount
  } else {
    let data = veANGLE.load(toId)!
    data.slope = data.amount.div(MAX_LOCK_TIME)
    data.bias = data.slope.times(locktime.minus(timestamp))
    data.endLocked = locktime
    data.lastUpdate = timestamp
    data.save()

    let dataHistorical = veANGLEHistorical.load(idHistorical)
    if (dataHistorical == null) {
      dataHistorical = new veANGLEHistorical(idHistorical)
    }
    dataHistorical.timestamp = timestamp
    dataHistorical.slope = data.slope
    dataHistorical.bias = data.bias
    dataHistorical.endLocked = data.endLocked
    dataHistorical.amount = data.amount
  }
}

export function handleWithdraw(event: Withdraw): void {
  const timestamp = event.params.ts
  const toId = event.params.provider.toHexString()
  const idHistorical = event.params.provider.toHexString() + '_hour_' + timestamp.toString()
  let data = veANGLE.load(toId)!

  // keep track of the locked ANGLE
  const roundedTimestamp = historicalSlice(event.block)
  const idLockedANGLEHistoricalHour = roundedTimestamp.toString()
  let dataHistoricalLockedANGLE = lockedANGLEHistorical.load(idLockedANGLEHistoricalHour)!
  dataHistoricalLockedANGLE.locked = dataHistoricalLockedANGLE.locked.minus(data.amount)
  dataHistoricalLockedANGLE.timestamp = roundedTimestamp
  dataHistoricalLockedANGLE.save()

  data.lastUpdate = timestamp
  data.slope = BigInt.fromString('0')
  data.bias = BigInt.fromString('0')
  data.endLocked = BigInt.fromString('0')
  data.amount = BigInt.fromString('0')
  data.save()
  // or just remove the datapoint
  // store.remove('veANGLE', toId)
  let dataHistorical = veANGLEHistorical.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new veANGLEHistorical(idHistorical)
  }
  dataHistorical.timestamp = timestamp
  dataHistorical.slope = BigInt.fromString('0')
  dataHistorical.bias = BigInt.fromString('0')
  dataHistorical.endLocked = BigInt.fromString('0')
  dataHistorical.amount = BigInt.fromString('0')
}
