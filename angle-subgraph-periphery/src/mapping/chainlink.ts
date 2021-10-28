import { AnswerUpdated, ChainlinkFeed } from '../../generated/Chainlink1/ChainlinkFeed'
import { OracleData } from '../../generated/schema'

export function handleAnswerUpdated(event: AnswerUpdated): void {
  const feed = ChainlinkFeed.bind(event.address)

  const description = feed.description()

  let data = OracleData.load(event.address.toHexString())
  if (data == null) {
    data = new OracleData(event.address.toHexString())
    data.oracle = event.address.toHexString()
    data.tokenIn = description.substr(0, 3)
    data.tokenOut = description.substr(-3)
  }
  data.rateLower = event.params.current
  data.rateUpper = event.params.current
  data.timestamp = event.block.timestamp
  data.blockNumber = event.block.number

  data.save()
}
