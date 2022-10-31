import { clearStore, test, newMockEvent, logStore, createMockedFunction } from 'matchstick-as/assembly/index'
import { log } from 'matchstick-as/assembly/log'
import { ethereum, Address } from '@graphprotocol/graph-ts'
import { CollateralDeployed } from '../generated/templates/StableMasterTemplate/StableMaster'
import { handleCollateralDeployed } from '../src/mapping/stableMaster'

function createMockCollateralDeployedEvent(
  poolManager: string,
  perpetualManager: string,
  sanToken: string,
  oracle: string
): CollateralDeployed {
  const mockEvent = newMockEvent()

  log.debug('Event: {} {} {} {}', [
    mockEvent.block.timestamp.toString(),
    mockEvent.block.number.toString(),
    mockEvent.address.toHexString(),
    mockEvent.transaction.from.toHexString()
  ])

  mockEvent.parameters = [
    new ethereum.EventParam('_poolManager', ethereum.Value.fromAddress(Address.fromString(poolManager))),
    new ethereum.EventParam('_perpetualManager', ethereum.Value.fromAddress(Address.fromString(perpetualManager))),
    new ethereum.EventParam('_sanToken', ethereum.Value.fromAddress(Address.fromString(sanToken))),
    new ethereum.EventParam('_oracle', ethereum.Value.fromAddress(Address.fromString(oracle)))
  ]

  const transfer = new CollateralDeployed(
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

function createMockReturnAddressFunction(
  contractAddress: string,
  funcName: string,
  signature: string,
  returnAddress: string
): void {
  createMockedFunction(Address.fromString(contractAddress), funcName, signature).returns([
    ethereum.Value.fromAddress(Address.fromString(returnAddress))
  ])
}

test('test collat deploy', () => {
  const poolManager = '0x1230000000000000000000000000000000000000'
  const perpetualManager = '0x4560000000000000000000000000000000000000'
  const sanToken = '0x7890000000000000000000000000000000000000'
  const oracle = '0xabc0000000000000000000000000000000000000'

  const stableMaster = '0xdef0000000000000000000000000000000000000'

  const token = '0xaaa0000000000000000000000000000000000000'
  const tokenSymbol = 'tokenSym'
  const agToken = '0xbbb0000000000000000000000000000000000000'
  const agTokenSymbol = 'symbolAg'

  createMockReturnAddressFunction(poolManager, 'token', 'token():(address)', token)
  createMockReturnAddressFunction(poolManager, 'stableMaster', 'stableMaster():(address)', stableMaster)
  createMockReturnAddressFunction(stableMaster, 'agToken', 'agToken():(address)', agToken)

  const collateralDeployedEvent = createMockCollateralDeployedEvent(poolManager, perpetualManager, sanToken, oracle)
  // const poolData = new PoolData(poolManager)
  // poolData.save()

  createMockedFunction(Address.fromString(stableMaster), 'paused', 'paused(bytes32):(bool)').returns([
    ethereum.Value.fromBoolean(true)
  ])

  handleCollateralDeployed(collateralDeployedEvent)

  logStore()

  // assert.fieldEquals('PoolData', poolManager, 'totalHedgeAmount', totalHedgeAmount)

  clearStore()
})

test(
  'test failing test',
  () => {
    throw new Error('test')
  },
  true
)
