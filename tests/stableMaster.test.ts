import { clearStore, test, assert, newMockEvent, logStore, createMockedFunction } from 'matchstick-as/assembly/index'
import { log } from 'matchstick-as/assembly/log'
import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
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

  createMockedFunction(
    Address.fromString(stableMaster),
    'collateralMap',
    'collateralMap(address):(address,address,address,address,uint256,uint256,uint256,(uint256,uint256,uint256,uint256,uint64,uint64,uint64,uint64),(uint64[],uint64[],uint64[],uint64[],uint64,uint64,uint64,uint256))'
  )
    .withArgs([ethereum.Value.fromAddress(Address.fromString(poolManager))])
    .returns(
      changetype<ethereum.Tuple>([
        ethereum.Value.fromAddress(Address.fromString('0x0000000000000000000000000000000000000123')),
        ethereum.Value.fromAddress(Address.fromString(sanToken)),
        ethereum.Value.fromAddress(Address.fromString(perpetualManager)),
        ethereum.Value.fromAddress(Address.fromString(oracle)),
        ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
        ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
        ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
        ethereum.Value.fromTuple(
          changetype<ethereum.Tuple>([
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2'))
          ])
        ),
        ethereum.Value.fromTuple(
          changetype<ethereum.Tuple>([
            ethereum.Value.fromArray([
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1'))
            ]),
            ethereum.Value.fromArray([
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1'))
            ]),
            ethereum.Value.fromArray([
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1'))
            ]),
            ethereum.Value.fromArray([
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
              ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1'))
            ]),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1')),
            ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2'))
          ])
        )
      ])
    )

  const collateralDeployedEvent = createMockCollateralDeployedEvent(poolManager, perpetualManager, sanToken, oracle)
  // const poolData = new PoolData(poolManager)
  // poolData.save()

  createMockedFunction(Address.fromString(token), 'decimals', 'decimals():(uint8)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('1'))
  ])
  createMockedFunction(Address.fromString(token), 'symbol', 'symbol():(string)').returns([
    ethereum.Value.fromString(tokenSymbol)
  ])
  createMockedFunction(Address.fromString(agToken), 'symbol', 'symbol():(string)').returns([
    ethereum.Value.fromString(agTokenSymbol)
  ])

  createMockedFunction(Address.fromString(poolManager), 'getTotalAsset', 'getTotalAsset():(uint256)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('2'))
  ])
  createMockedFunction(Address.fromString(poolManager), 'getBalance', 'getBalance():(uint256)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3'))
  ])
  createMockedFunction(Address.fromString(poolManager), 'estimatedAPR', 'estimatedAPR():(uint256)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3'))
  ])

  const totalHedgeAmount = '3'
  createMockedFunction(
    Address.fromString(perpetualManager),
    'totalHedgeAmount',
    'totalHedgeAmount():(uint256)'
  ).returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString(totalHedgeAmount))])
  createMockedFunction(Address.fromString(perpetualManager), 'targetHAHedge', 'targetHAHedge():(uint64)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3'))
  ])
  createMockedFunction(Address.fromString(perpetualManager), 'limitHAHedge', 'limitHAHedge():(uint64)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3'))
  ])
  createMockedFunction(
    Address.fromString(perpetualManager),
    'keeperFeesLiquidationCap',
    'keeperFeesLiquidationCap():(uint256)'
  ).returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3'))])
  const keeperFeesClosingCap = '10'
  createMockedFunction(
    Address.fromString(perpetualManager),
    'keeperFeesClosingCap',
    'keeperFeesClosingCap():(uint256)'
  ).returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString(keeperFeesClosingCap))])
  createMockedFunction(
    Address.fromString(perpetualManager),
    'keeperFeesLiquidationRatio',
    'keeperFeesLiquidationRatio():(uint64)'
  ).returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3'))])

  createMockedFunction(Address.fromString(oracle), 'readAll', 'readAll():(uint256,uint256)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('10')),
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('11'))
  ])

  createMockedFunction(Address.fromString(sanToken), 'totalSupply', 'totalSupply():(uint256)').returns([
    ethereum.Value.fromUnsignedBigInt(BigInt.fromString('3'))
  ])

  handleCollateralDeployed(collateralDeployedEvent)

  logStore()

  const poolDataHistoricalId = poolManager + '_' + collateralDeployedEvent.block.number.toHexString()
  const hourStartTimestamp = collateralDeployedEvent.block.timestamp
    .div(BigInt.fromString('3600'))
    .times(BigInt.fromString('3600'))
  const oracleHistoricalId = poolManager + '_hour_' + hourStartTimestamp.toString()

  assert.fieldEquals('PoolData', poolManager, 'totalHedgeAmount', totalHedgeAmount)
  assert.fieldEquals('PoolHistoricalData', poolDataHistoricalId, 'keeperFeesClosingCap', keeperFeesClosingCap)
  assert.fieldEquals('OracleAPRHistoricalHourlyData', oracleHistoricalId, 'collatName', tokenSymbol)

  clearStore()
})

test(
  'test failing test',
  () => {
    throw new Error('test')
  },
  true
)
