import { Address, ethereum, crypto, Bytes, ByteArray } from '@graphprotocol/graph-ts'
import {
  Paused,
  Unpaused,
  StableMaster,
  CollateralDeployed
} from '../../generated/templates/StableMasterTemplate/StableMaster'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { PerpetualManagerFrontTemplate } from '../../generated/templates'
import { PauseData, PoolData, Contracts } from '../../generated/schema'

import { _updatePoolData } from './utils'

export function handleCollateralDeployed(event: CollateralDeployed): void {
  // Start indexing and tracking new contracts
  PerpetualManagerFrontTemplate.create(event.params._perpetualManager)

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
