import { clearStore, test, newMockEvent, logStore, createMockedFunction } from 'matchstick-as/assembly/index'
import { log } from 'matchstick-as/assembly/log'
import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import { StrategyAdded } from '../generated/templates/ERCManagerFrontTemplate/PoolManager'
import { handleStrategyAdded } from '../src/mapping/ercManager'

function createMockEvent(strategyAddress: string): StrategyAdded {
  const mockEvent = newMockEvent()

  log.debug('Event: {} {} {} {}', [
    mockEvent.block.timestamp.toString(),
    mockEvent.block.number.toString(),
    mockEvent.address.toHexString(),
    mockEvent.transaction.from.toHexString()
  ])

  mockEvent.parameters = [
    new ethereum.EventParam('strategy', ethereum.Value.fromAddress(Address.fromString(strategyAddress)))
  ]

  const transfer = new StrategyAdded(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters
  )

  return transfer
}

test('test strategy lenders', () => {
  const strategyAddress = "0xabcabcabcabcabcabcabcabcabcabcabcabcabc0"
  const mockEvent = createMockEvent(strategyAddress)

  createMockedFunction(Address.fromString(strategyAddress), "estimatedAPR", "estimatedAPR():(uint256)")
    .returns([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1")),
    ])

  createMockedFunction(Address.fromString(strategyAddress), "lenders", "lenders(uint256):(address)")
    .withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("0"))
    ])
    .returns([
      ethereum.Value.fromAddress(Address.fromString("0xffffffffffffffffffffffffffffffffffffffff"))
    ])

  createMockedFunction(Address.fromString(strategyAddress), "lenders", "lenders(uint256):(address)")
    .withArgs([
      ethereum.Value.fromUnsignedBigInt(BigInt.fromString("1"))
    ])
    .reverts()

  handleStrategyAdded(mockEvent)

  logStore()
  clearStore()
})

