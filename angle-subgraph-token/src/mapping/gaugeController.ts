import { BigInt, store } from '@graphprotocol/graph-ts'
import { GaugeData } from '../../generated/schema'
import { LiquidityGaugeTemplate, PerpetualStakingRewardsTemplate } from '../../generated/templates'
import { KilledGauge, NewGauge } from '../../generated/GaugeController/GaugeController'

export function handleNewGauge(event: NewGauge): void {
  const block = event.block
  let type: BigInt

  if (event.params.gauge_type.equals(BigInt.fromString('0'))) {
    // Start indexing and tracking new contracts
    LiquidityGaugeTemplate.create(event.params.addr)
  } else if (event.params.gauge_type.equals(BigInt.fromString('1'))) {
    // Start indexing and tracking new contracts
    PerpetualStakingRewardsTemplate.create(event.params.addr)
  }

  const id = event.params.addr.toHexString()
  const data = new GaugeData(id)
  data.type = event.params.gauge_type
  data.save()
}

export function handleKillGauge(event: KilledGauge): void {
  const id = event.params.addr
  store.remove('StakingData', id.toHexString())
}
