import { ethereum } from '@graphprotocol/graph-ts'
import { BondingCurve } from '../../generated/BondingCurve/BondingCurve'
import { bondingCurve } from '../../generated/schema'

export function handleBondingCurve(event: ethereum.Event): void {
  const bondingCurveContract = BondingCurve.bind(event.address)

  let data = bondingCurve.load(event.address.toHexString())
  if (data == null) {
    data = new bondingCurve(event.address.toHexString())
  }
  data.price = bondingCurveContract.getCurrentPrice()
  data.sold = bondingCurveContract.tokensSold()
  data.toSell = bondingCurveContract.totalTokensToSell().minus(bondingCurveContract.tokensSold())
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number

  data.save()
}
