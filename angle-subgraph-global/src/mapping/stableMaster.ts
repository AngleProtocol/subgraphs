import { Address, ethereum, crypto, Bytes, ByteArray, BigInt, BigDecimal, log } from '@graphprotocol/graph-ts'
import {
  Paused,
  Unpaused,
  StableMaster,
  CollateralDeployed,
  MintedStablecoins,
  BurntStablecoins,
  FeeArrayUpdated,
  OracleUpdated
} from '../../generated/templates/StableMasterTemplate/StableMaster'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { FeeManagerTemplate, PerpetualManagerFrontTemplate, SanTokenTemplate } from '../../generated/templates'
import { PauseData, PoolData, Contracts, Mint, Burn } from '../../generated/schema'

import { updateOracleData, updateStableData, _getBurnFee, _getMintFee, _updateGainPoolData, _updatePoolData } from './utilsCore'
import { ERCManagerFrontTemplate } from '../../../angle-subgraph-transaction/generated/templates'
import { Oracle } from '../../generated/templates/AgTokenTemplate/Oracle'
import { convertTokenListToDecimal, convertTokenToDecimal } from '../utils'
import { DECIMAL_PARAMS, ZERO_BD } from '../../../constants'
import { getToken, _trackNewChainlinkOracle } from './utils'
import { StableData } from '../../generated/schema'

function updatePoolData(
  poolManager: PoolManager,
  block: ethereum.Block,
  protocolFees: BigDecimal = ZERO_BD,
  SLPFees: BigDecimal = ZERO_BD
): void {
  const data = _updatePoolData(poolManager, block)
  data.save()
  _updateGainPoolData(poolManager, block, protocolFees, ZERO_BD, SLPFees)
}

export function handleCollateralDeployed(event: CollateralDeployed): void {
  // Start indexing and tracking new contracts
  PerpetualManagerFrontTemplate.create(event.params._perpetualManager)
  ERCManagerFrontTemplate.create(event.params._poolManager)
  SanTokenTemplate.create(event.params._sanToken)

  let contractData = new Contracts(event.params._perpetualManager.toHexString())
  contractData.save()

  contractData = new Contracts(event.params._poolManager.toHexString())
  contractData.save()

  const block = event.block

  const poolManager = PoolManager.bind(event.params._poolManager)
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const collatData = stableMaster.collateralMap(poolManager._address)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)

  const feeManager = poolManager.feeManager()
  FeeManagerTemplate.create(feeManager)

  const data = _updatePoolData(poolManager, block)

  const id = poolManager._address.toHexString()

  const stableDataId = stableMaster._address.toHexString()
  let stableData = StableData.load(stableDataId)!
  let poolsList = stableData.poolsAddress
  poolsList.push(id)
  stableData.poolsAddress = poolsList
  stableData.save()

  let pauseData = PauseData.load(id)
  if (pauseData == null) {
    pauseData = new PauseData(id)
    pauseData.user = true
    pauseData.slp = true
  }

  pauseData.ha = perpetualManager.paused()

  pauseData.save()

  data.pauseData = id

  data.save()

  updateOracleData(poolManager, event.block)
}
export function handlePause(event: Paused): void {
  const pausing = changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('pause(bytes32,address)')).subarray(0, 4))
  const header = changetype<Bytes>(event.transaction.input.subarray(0, 4))
  if (header != pausing) return

  const inputPool = changetype<Bytes>(event.transaction.input.subarray(48, 68))
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))

  const call = poolManager.try_stableMaster()
  if (call.reverted) return
  const stableMaster = StableMaster.bind(call.value)
  const collatData = stableMaster.collateralMap(poolManager._address)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)

  const id = poolManager._address.toHexString()

  let data = PoolData.load(id)
  if (data == null) {
    data = new PoolData(id)
  }

  let tupleArrayStable: Array<ethereum.Value> = [
    ethereum.Value.fromBytes(changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('STABLE')))),
    ethereum.Value.fromAddress(poolManager._address)
  ]
  let tupleStable = changetype<ethereum.Tuple>(tupleArrayStable)
  let encodedStable = ethereum.encode(ethereum.Value.fromTuple(tupleStable))!
  let hashedStable = changetype<Bytes>(crypto.keccak256(encodedStable))

  let tupleArraySLP: Array<ethereum.Value> = [
    ethereum.Value.fromBytes(changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('SLP')))),
    ethereum.Value.fromAddress(poolManager._address)
  ]
  let tupleSLP = changetype<ethereum.Tuple>(tupleArraySLP)
  let encodedSLP = ethereum.encode(ethereum.Value.fromTuple(tupleSLP))!
  let hashedSLP = changetype<Bytes>(crypto.keccak256(encodedSLP))

  let pauseData = PauseData.load(id)
  if (pauseData == null) {
    pauseData = new PauseData(id)
  }
  pauseData.user = stableMaster.paused(hashedStable)
  pauseData.slp = stableMaster.paused(hashedSLP)
  pauseData.ha = perpetualManager.paused()

  pauseData.save()

  data.pauseData = id
  data.save()
}

export function handleUnpause(event: Unpaused): void {
  const unpausing = changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('unpause(bytes32,address)')).subarray(0, 4))
  const header = changetype<Bytes>(event.transaction.input.subarray(0, 4))
  if (header != unpausing) return

  const inputPool = changetype<Bytes>(event.transaction.input.subarray(48, 68))
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))

  const call = poolManager.try_stableMaster()
  if (call.reverted) return

  const stableMaster = StableMaster.bind(call.value)
  const collatData = stableMaster.collateralMap(poolManager._address)
  const perpetualManager = PerpetualManagerFront.bind(collatData.value2)

  const id = poolManager._address.toHexString()

  let data = PoolData.load(id)
  if (data == null) {
    data = new PoolData(id)
  }

  let tupleArrayStable: Array<ethereum.Value> = [
    ethereum.Value.fromBytes(changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('STABLE')))),
    ethereum.Value.fromAddress(poolManager._address)
  ]
  let tupleStable = changetype<ethereum.Tuple>(tupleArrayStable)
  let encodedStable = ethereum.encode(ethereum.Value.fromTuple(tupleStable))!
  let hashedStable = changetype<Bytes>(crypto.keccak256(encodedStable))

  let tupleArraySLP: Array<ethereum.Value> = [
    ethereum.Value.fromBytes(changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('SLP')))),
    ethereum.Value.fromAddress(poolManager._address)
  ]
  let tupleSLP = changetype<ethereum.Tuple>(tupleArraySLP)
  let encodedSLP = ethereum.encode(ethereum.Value.fromTuple(tupleSLP))!
  let hashedSLP = changetype<Bytes>(crypto.keccak256(encodedSLP))

  let pauseData = PauseData.load(id)
  if (pauseData == null) {
    pauseData = new PauseData(id)
  }
  pauseData.user = stableMaster.paused(hashedStable)
  pauseData.slp = stableMaster.paused(hashedSLP)
  pauseData.ha = perpetualManager.paused()

  pauseData.save()
  data.pauseData = id
  data.save()
}

export function handleMint(event: MintedStablecoins): void {
  // Do nothing if any of the transfer are void
  if (
    event.params.amount.equals(BigInt.fromString('0')) ||
    event.params.amountForUserInStable.equals(BigInt.fromString('0'))
  )
    return

  // Bind contracts
  let inputPool = event.params._poolManager
  let dataPool = PoolData.load(inputPool.toHexString())!
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))
  const stableMaster = StableMaster.bind(Address.fromString(dataPool.stableMaster))
  const stablecoinInfo = getToken(Address.fromString(dataPool.stablecoin))
  const collateralInfo = getToken(Address.fromString(dataPool.collateral))
  const amount = convertTokenToDecimal(event.params.amount, collateralInfo.decimals)

  updateOracleData(poolManager, event.block)
  const fees = _getMintFee(poolManager, amount)
  updateStableData(stableMaster, event.block)
  updatePoolData(poolManager, event.block, fees[0], fees[1])

  const id =
    event.transaction.hash.toHexString() + '_' + event.address.toHexString() + '_' + event.params.amount.toString()
  let mintData = new Mint(id)
  mintData.transactionId = event.transaction.hash.toHexString()
  mintData.minted = convertTokenToDecimal(event.params.amountForUserInStable, stablecoinInfo.decimals)
  mintData.sender = event.transaction.from.toHexString()
  // this is not true we do not have access to the recipient of this txs we can use the signature function but
  // if it was called via another contract it won't work
  mintData.recipient = event.transaction.from.toHexString()
  mintData.amount = amount
  mintData.timestamp = event.block.timestamp

  mintData.collatName = collateralInfo.symbol
  mintData.stableName = stablecoinInfo.symbol
  mintData.save()
}

export function handleBurn(event: BurntStablecoins): void {
  // Do nothing if any of the transfer are void
  if (event.params.amount.equals(BigInt.fromString('0')) || event.params.redeemInC.equals(BigInt.fromString('0')))
    return

  // Bind contracts
  let inputPool = event.params._poolManager
  let dataPool = PoolData.load(inputPool.toHexString())!
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))
  const stableMaster = StableMaster.bind(Address.fromString(dataPool.stableMaster))
  const stablecoinInfo = getToken(Address.fromString(dataPool.stablecoin))
  const collateralInfo = getToken(Address.fromString(dataPool.collateral))
  const amount = convertTokenToDecimal(event.params.amount, stablecoinInfo.decimals)

  updateOracleData(poolManager, event.block)
  const fees = _getBurnFee(poolManager, amount)
  updateStableData(stableMaster, event.block)
  updatePoolData(poolManager, event.block, fees[0], fees[1])

  const id =
    event.transaction.hash.toHexString() + '_' + event.address.toHexString() + '_' + event.params.amount.toString()
  let burnData = new Burn(id)
  burnData.transactionId = event.transaction.hash.toHexString()
  burnData.burned = amount
  burnData.sender = event.transaction.from.toHexString()
  // this is not true we do not have access to the recipient of this txs we can use the signature function but
  // if it was called via another contract it won't work
  burnData.recipient = event.transaction.from.toHexString()
  burnData.timestamp = event.block.timestamp
  burnData.blockNumber = event.block.number
  burnData.amount = convertTokenToDecimal(event.params.redeemInC, collateralInfo.decimals)

  burnData.collatName = collateralInfo.symbol
  burnData.stableName = stablecoinInfo.symbol

  burnData.save()
}

export function handleUserFeeUpdate(event: FeeArrayUpdated): void {
  // Bind contracts
  let inputPool = event.params._poolManager.toHexString()
  let data = PoolData.load(inputPool)!
  if (event.params._type > 0) {
    data.xFeeMint = convertTokenListToDecimal(event.params._xFee, DECIMAL_PARAMS)
    data.yFeeMint = convertTokenListToDecimal(event.params._yFee, DECIMAL_PARAMS)
  } else {
    data.xFeeBurn = convertTokenListToDecimal(event.params._xFee, DECIMAL_PARAMS)
    data.yFeeBurn = convertTokenListToDecimal(event.params._yFee, DECIMAL_PARAMS)
  }
  data.save()
}

export function handleSetOracle(event: OracleUpdated): void {
  const oracle = Oracle.bind(event.params._oracle)
  _trackNewChainlinkOracle(oracle, event.block.timestamp, true)

  const poolData = PoolData.load(event.params._poolManager.toHexString())!
  poolData.oracle = event.params._oracle.toHexString()
  poolData.save()
}
