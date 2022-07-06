import { Address, BigInt, store } from '@graphprotocol/graph-ts'
import { Transfer } from '../../generated/Angle/ERC20Votes'
import { ANGLE, ANGLEHistorical } from '../../generated/schema'
import { historicalSlice } from './utils'

// @notice Track balances of all ANGLE holders
export function handleTransfer(event: Transfer): void {
  const fromId = event.params.from.toHexString()
  const toId = event.params.to.toHexString()
  const roundedTimestamp = historicalSlice(event.block)
  const fromIdHistorical = event.params.from.toHexString() + '_hour_' + roundedTimestamp.toString()
  const toIdHistorical = event.params.to.toHexString() + '_hour_' + roundedTimestamp.toString()
  if (event.params.value.gt(BigInt.fromString('0'))) {
    if (event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))) {
      const data = ANGLE.load(fromId)!
      let dataAngleHistorical = ANGLEHistorical.load(fromIdHistorical)
      if (dataAngleHistorical == null) {
        dataAngleHistorical = new ANGLEHistorical(fromIdHistorical)
        dataAngleHistorical.owner = data.id
        dataAngleHistorical.timestamp = roundedTimestamp
      }
      if (data.balance.equals(event.params.value)) {
        store.remove('ANGLE', fromId)
        store.remove('ANGLEHistorical', fromIdHistorical)
      } else {
        data.balance = data.balance.minus(event.params.value)
        data.save()
        dataAngleHistorical.balance = data.balance
        dataAngleHistorical.save()
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
      let dataAngleHistorical = ANGLEHistorical.load(toIdHistorical)
      if (dataAngleHistorical == null) {
        dataAngleHistorical = new ANGLEHistorical(toIdHistorical)
        dataAngleHistorical.owner = data.id
        dataAngleHistorical.timestamp = roundedTimestamp
      }
      dataAngleHistorical.balance = data.balance
      dataAngleHistorical.save()
    } else {
      const fromData = ANGLE.load(fromId)!
      fromData.balance = fromData.balance.minus(event.params.value)
      fromData.save()
      let toData = ANGLE.load(toId)
      let dataAngleHistoricalFrom = ANGLEHistorical.load(fromIdHistorical)
      if (dataAngleHistoricalFrom == null) {
        dataAngleHistoricalFrom = new ANGLEHistorical(fromIdHistorical)
        dataAngleHistoricalFrom.owner = fromData.id
        dataAngleHistoricalFrom.timestamp = roundedTimestamp
      }

      if (toData == null) {
        toData = new ANGLE(toId)
        toData.balance = event.params.value
      } else {
        toData.balance = toData.balance.plus(event.params.value)
      }
      toData.save()
      let dataAngleHistoricalTo = ANGLEHistorical.load(toIdHistorical)
      if (dataAngleHistoricalTo == null) {
        dataAngleHistoricalTo = new ANGLEHistorical(toIdHistorical)
        dataAngleHistoricalTo.owner = toData.id
        dataAngleHistoricalTo.timestamp = roundedTimestamp
      }
      dataAngleHistoricalFrom.balance = fromData.balance
      dataAngleHistoricalTo.balance = toData.balance
      dataAngleHistoricalFrom.save()
      dataAngleHistoricalTo.save()
    }
  }
}
