import { BigInt } from '@graphprotocol/graph-ts'
import { NewGauge } from '../../generated/GaugeController/GaugeController'
import { LiquidityGaugeTemplate } from '../../generated/templates'

export function handleNewGauge(event: NewGauge): void {
  // Start LiquidityGauge
  if (event.params.gauge_type.equals(BigInt.fromString('0'))) {
    LiquidityGaugeTemplate.create(event.params.addr)
  }
}
