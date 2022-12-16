import { BigInt } from '@graphprotocol/graph-ts'
import { GaugeData, GaugeHistoricalData } from '../../generated/schema'
import { LiquidityGaugeTemplate, PerpetualStakingRewardsTemplate } from '../../generated/templates'
import { GaugeController, NewGauge, VoteForGauge } from '../../generated/GaugeController/GaugeController'
import { historicalSlice } from './utils'
import { convertTokenToDecimal } from '../utils'
import { DECIMAL_TOKENS } from '../../../constants'

export function handleNewGauge(event: NewGauge): void {
  const block = event.block
  const timestamp = block.timestamp

  if (event.params.gauge_type.equals(BigInt.fromString('0'))) {
    // Start indexing and tracking new contracts
    LiquidityGaugeTemplate.create(event.params.addr)
  } else if (event.params.gauge_type.equals(BigInt.fromString('1'))) {
    // Start indexing and tracking new contracts
    PerpetualStakingRewardsTemplate.create(event.params.addr)
  }

  const id = event.params.addr.toHexString()
  const roundedTimestamp = historicalSlice(block)
  const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

  const data = new GaugeData(id)
  const dataHistorical = new GaugeHistoricalData(idHistoricalHour)
  data.type = event.params.gauge_type
  data.blockNumber = block.number
  data.timestamp = timestamp
  dataHistorical.type = event.params.gauge_type
  dataHistorical.blockNumber = block.number
  dataHistorical.timestamp = roundedTimestamp

  data.save()
  dataHistorical.save()
}

export function handleGaugeVote(event: VoteForGauge): void {
  const gaugeControllerContract = GaugeController.bind(event.address)
  const block = event.block
  const timestamp = block.timestamp

  const gaugeCount = parseInt(gaugeControllerContract.n_gauges().toString())
  for (let i = 0; i < gaugeCount; i++) {
    const gauge = gaugeControllerContract.gauges(BigInt.fromString(i.toString()))

    const id = gauge.toHexString()
    const roundedTimestamp = historicalSlice(block)
    const idHistoricalHour = id + '_hour_' + roundedTimestamp.toString()

    let data = GaugeData.load(gauge.toHexString())!
    const relWeigth = convertTokenToDecimal(gaugeControllerContract.gauge_relative_weight(gauge), DECIMAL_TOKENS)
    data.relWeigth = relWeigth
    data.blockNumber = block.number
    data.timestamp = timestamp

    let dataHistorical = GaugeHistoricalData.load(idHistoricalHour)
    if (dataHistorical == null) {
      dataHistorical = new GaugeHistoricalData(idHistoricalHour)
      dataHistorical.type = data.type
      dataHistorical.relWeigth = relWeigth
      dataHistorical.blockNumber = block.number
      dataHistorical.timestamp = roundedTimestamp
    } else {
      dataHistorical.relWeigth = relWeigth
      dataHistorical.blockNumber = block.number
      dataHistorical.timestamp = roundedTimestamp
    }

    data.save()
    dataHistorical.save()
  }
}
