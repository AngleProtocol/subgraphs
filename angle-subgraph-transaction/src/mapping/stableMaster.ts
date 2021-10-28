import { Address, ethereum, crypto, Bytes, ByteArray, BigInt } from '@graphprotocol/graph-ts'
import {
  Paused,
  Unpaused,
  StableMaster,
  CollateralDeployed,
  MintedStablecoins,
  BurntStablecoins
} from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERC20 } from '../../generated/templates/StableMasterTemplate/ERC20'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { AgToken as AgTokenContract } from '../../generated/templates/StableMasterTemplate/AgToken'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { PerpetualManagerFrontTemplate, SanTokenTemplate } from '../../generated/templates'
import { PauseData, PoolData, Contracts, Mint, Burn } from '../../generated/schema'

import { updateStableData, _updatePoolData } from './utils'

function updatePoolData(poolManager: PoolManager, block: ethereum.Block): void {
  const data = _updatePoolData(poolManager, block)
  data.save()
}

export function handleCollateralDeployed(event: CollateralDeployed): void {
  // Start indexing and tracking new contracts
  PerpetualManagerFrontTemplate.create(event.params._perpetualManager)
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

  const data = _updatePoolData(poolManager, block)

  const id = poolManager._address.toHexString()

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
}
export function handlePause(event: Paused): void {
  // const pausing = changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('pause(bytes32,address)')).subarray(0, 4))
  // const header = changetype<Bytes>(event.transaction.input.subarray(0, 4))
  // if (header != pausing) return;

  const inputPool = changetype<Bytes>(event.transaction.input.subarray(48, 68))
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))

  const call = poolManager.try_stableMaster()
  if (call.reverted) return
  const stableMaster = StableMaster.bind(call.value)
  const token = ERC20.bind(poolManager.token())
  const agToken = AgTokenContract.bind(stableMaster.agToken())
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
  // const unpausing = changetype<Bytes>(crypto.keccak256(ByteArray.fromUTF8('unpause(bytes32,address)')).subarray(0, 4))
  // const header = changetype<Bytes>(event.transaction.input.subarray(0, 4))
  // if (header != unpausing) return;

  const inputPool = changetype<Bytes>(event.transaction.input.subarray(48, 68))
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))

  const call = poolManager.try_stableMaster()
  if (call.reverted) return

  const stableMaster = StableMaster.bind(call.value)
  const token = ERC20.bind(poolManager.token())
  const agToken = AgTokenContract.bind(stableMaster.agToken())
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
  let inputPool: Bytes = event.params._poolManager
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const stableName = ERC20.bind(stableMaster.agToken()).symbol()

  updateStableData(stableMaster, event.block)
  updatePoolData(poolManager, event.block)

  const id =
    event.transaction.hash.toHexString() + '_' + event.address.toHexString() + '_' + event.params.amount.toString()
  let mintData = new Mint(id)
  mintData.transactionId = event.transaction.hash.toHexString()
  mintData.minted = event.params.amountForUserInStable
  mintData.sender = event.transaction.from.toHexString()
  // this is not true we do not have access to the recipient of this txs we can use the signature function but
  // if it was called via another contract it won't work
  mintData.recipient = event.transaction.from.toHexString()
  mintData.amount = event.params.amount
  mintData.timestamp = event.block.timestamp

  const token = ERC20.bind(poolManager.token())
  const collatName = token.symbol()
  mintData.collatName = collatName
  mintData.stableName = stableName
  mintData.save()
}

export function handleBurn(event: BurntStablecoins): void {
  // Do nothing if any of the transfer are void
  if (event.params.amount.equals(BigInt.fromString('0')) || event.params.redeemInC.equals(BigInt.fromString('0')))
    return

  // Bind contracts
  let inputPool: Bytes = event.params._poolManager
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const stableName = ERC20.bind(stableMaster.agToken()).symbol()
  // update protocol data entities in case of a mint or a burn
  updateStableData(stableMaster, event.block)
  updatePoolData(poolManager, event.block)

  const id =
    event.transaction.hash.toHexString() + '_' + event.address.toHexString() + '_' + event.params.amount.toString()
  let burnData = new Burn(id)
  burnData.transactionId = event.transaction.hash.toHexString()
  burnData.burned = event.params.amount
  burnData.sender = event.transaction.from.toHexString()
  // this is not true we do not have access to the recipient of this txs we can use the signature function but
  // if it was called via another contract it won't work
  burnData.recipient = event.transaction.from.toHexString()
  burnData.timestamp = event.block.timestamp
  burnData.blockNumber = event.block.number
  burnData.amount = event.params.redeemInC

  const collatName = ERC20.bind(poolManager.token()).symbol()
  burnData.collatName = collatName
  burnData.stableName = stableName

  burnData.save()
}
