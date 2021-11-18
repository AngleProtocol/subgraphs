import { ethereum, Address, BigInt } from '@graphprotocol/graph-ts'
import {
  KeeperTransferred,
  PerpetualClosed,
  PerpetualOpened,
  PerpetualsForceClosed,
  PerpetualUpdated,
  Transfer
} from '../../generated/templates/PerpetualManagerFrontTemplate/PerpetualManagerFront'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { ERC20 } from '../../generated/templates/PerpetualManagerFrontTemplate/ERC20'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { Perpetual, PerpetualOpen, PerpetualUpdate, PoolData, PauseData, PerpetualClose } from '../../generated/schema'

import {
  updateStableData,
  _computeHedgeRatio,
  _getDepositFees,
  _updatePoolData,
  _getFeesClosePerp,
  _getFeesLiquidationPerp,
  _getForceCloseFees,
  _updateFeePoolData,
  _getFeesOpenPerp
} from './utils'
import { BASE_PARAMS } from '../../../constants'
import { MAINTENANCE_MARGIN } from '../../../constants'

function updatePoolData(poolManager: PoolManager, block: ethereum.Block, add: boolean, margin: BigInt): void {
  const data = _updatePoolData(poolManager, block, add, margin)
  data.save()
}

export function handleOpeningPerpetual(event: PerpetualOpened): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const token = ERC20.bind(poolManager.token())
  const decimals = BigInt.fromI32(token.decimals())

  const id = event.address.toHexString() + '_' + event.params._perpetualID.toHexString()
  let data = Perpetual.load(id)!
  data.margin = event.params._margin
  data.committedAmount = event.params._committedAmount
  data.entryRate = event.params._entryRate
  data.liquidationPrice = event.params._committedAmount
    .times(event.params._entryRate)
    .div(event.params._margin.plus(event.params._committedAmount.times(BASE_PARAMS.minus(MAINTENANCE_MARGIN))))

  data.status = 'open'
  data.save()

  const txId =
    event.transaction.hash.toHexString() +
    '_' +
    event.address.toHexString() +
    '_' +
    event.params._perpetualID.toHexString()

  const txData = new PerpetualOpen(txId)
  txData.transactionId = event.transaction.hash.toHexString()
  txData.perpetualID = event.params._perpetualID
  txData.sender = event.transaction.from.toHexString()
  txData.entryRate = event.params._entryRate
  txData.margin = event.params._margin
  txData.committedAmount = event.params._committedAmount
  txData.collatName = data.collatName
  txData.stableName = data.stableName
  txData.timestamp = event.block.timestamp
  txData.blockNumber = event.block.number
  txData.save()

  const fee = _getFeesOpenPerp(perpetualManager, poolManager, decimals, event)
  _updateFeePoolData(poolManager, event.block, fee)
}

export function handleUpdatingPerpetual(event: PerpetualUpdated): void {
  const id = event.address.toHexString() + '_' + event.params._perpetualID.toHexString()
  const data = Perpetual.load(id)!

  // updat§e total margin accordingly
  const add = event.params._margin > data.margin
  const updateMargin = add ? event.params._margin.minus(data.margin) : data.margin.minus(event.params._margin)

  data.margin = event.params._margin
  data.lastUpdateTimestamp = event.block.timestamp
  data.lastUpdateBlockNumber = event.block.number
  // entry rate should always be non null as the perp is already opened
  data.liquidationPrice = data
    .committedAmount!.times(data.entryRate!)
    .div(event.params._margin.plus(data.committedAmount!.times(BASE_PARAMS.minus(MAINTENANCE_MARGIN))))
  data.save()

  const perp = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perp.poolManager())
  const collatName = ERC20.bind(poolManager.token()).symbol()
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const stableName = ERC20.bind(stableMaster.agToken()).symbol()
  const txId =
    event.transaction.hash.toHexString() +
    '_' +
    event.address.toHexString() +
    '_' +
    event.params._perpetualID.toHexString()
  const txData = new PerpetualUpdate(txId)
  txData.transactionId = event.transaction.hash.toHexString()
  txData.sender = event.transaction.from.toHexString()
  txData.perpetualID = event.params._perpetualID
  txData.margin = event.params._margin
  txData.collatName = collatName
  txData.stableName = stableName
  txData.timestamp = event.block.timestamp
  txData.blockNumber = event.block.number
  txData.save()

  updatePoolData(poolManager, event.block, add, updateMargin)
}

export function handleClosingPerpetual(event: PerpetualClosed): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const id = event.address.toHexString() + '_' + event.params._perpetualID.toHexString()

  const data = Perpetual.load(id)!
  data.closeAmount = event.params._closeAmount
  data.status = 'close'
  data.save()

  const txData = PerpetualClose.load(id)!
  txData.sender = event.transaction.from.toHexString()
  txData.closeAmount = event.params._closeAmount
  txData.status = 'close'
  txData.save()

  const fee = _getFeesClosePerp(perpetualManager, data)
  _updateFeePoolData(poolManager, event.block, fee)
}

export function handleForceClose(event: PerpetualsForceClosed): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())

  let totalCloseFee
  let totalLiquidationFee
  for (let i = 0; i < event.params.perpetualIDs.length; i++) {
    const id = event.address.toHexString() + '_' + event.params.perpetualIDs[i].toHexString()
    let data = Perpetual.load(id)!

    let txData = PerpetualClose.load(id)
    // this can happen if the keeper try to close or liquidate a perpetual that can't be
    if (txData !== null) {
      data.closeAmount = event.params.ownerAndCashOut[i].netCashOutAmount
      const status = event.params.ownerAndCashOut[i].netCashOutAmount.gt(BigInt.fromString('0'))
        ? 'forceClose'
        : 'liquidate'
      data.status = status
      data.keeperAddress = event.transaction.from.toHexString()

      txData.closeAmount = event.params.ownerAndCashOut[i].netCashOutAmount
      txData.status = status
      txData.save()

      if (event.params.ownerAndCashOut[i].netCashOutAmount.gt(BigInt.fromString('0'))) {
        totalCloseFee = totalCloseFee.plus(_getFeesClosePerp(perpetualManager, data))
      } else {
        totalLiquidationFee = totalLiquidationFee.plus(_getFeesLiquidationPerp(perpetualManager, data))
      }
    }
    data.save()
  }

  const totalHedgeAmount = perpetualManager.totalHedgeAmount()
  const collatData = stableMaster.collateralMap(poolManager._address)
  const stocksUsers = collatData.value4
  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers, totalHedgeAmount)

  const protocolCloseFee = _getForceCloseFees(perpetualManager, hedgeRatio, totalCloseFee)
  _updateFeePoolData(poolManager, event.block, protocolCloseFee.plus(totalLiquidationFee))
}

export function handleLiquidatePerpetuals(event: KeeperTransferred): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const keeperFeesLiquidationRatio = perpetualManager.keeperFeesLiquidationRatio()

  const approxProtocolCloseFee = event.params.liquidationFees
    .times(BASE_PARAMS.minus(keeperFeesLiquidationRatio))
    .div(keeperFeesLiquidationRatio)

  _updateFeePoolData(poolManager, event.block, approxProtocolCloseFee)
}

export function handleTransfer(event: Transfer): void {
  const PerpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(PerpetualManager.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())

  const id = event.address.toHexString() + '_' + event.params.tokenId.toHexString()

  // if the Perp is being closed (sent to 0 address)
  if (event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))) {
    const data = Perpetual.load(id)!
    const margin = data.margin
    data.lastUpdateTimestamp = event.block.timestamp
    data.lastUpdateBlockNumber = event.block.number
    // we first write as if the perpetual was liquidated. If it was actually Closed it will go through the event PerpetualClosed
    // If it was forceClose it will trigger the event PerpetualForceClosed. Such that data will be updated accordingly
    data.status = 'liquidate'
    data.keeperAddress = event.transaction.from.toHexString()
    data.save()

    const txData = new PerpetualClose(id)
    txData.transactionId = event.transaction.hash.toHexString()
    txData.perpetualID = data.perpetualID
    txData.sender = event.transaction.from.toHexString()
    txData.collatName = data.collatName
    txData.stableName = data.stableName
    txData.margin = data.margin
    txData.owner = data.owner
    txData.timestamp = event.block.timestamp
    txData.blockNumber = event.block.number
    txData.status = 'liquidate'
    txData.save()

    updatePoolData(poolManager, event.block, false, margin)
  }

  // Case of a transfer or a mint
  else {
    const PerpetualManager = PerpetualManagerFront.bind(event.address)
    const poolManager = PoolManager.bind(PerpetualManager.poolManager())
    const stableMaster = StableMaster.bind(poolManager.stableMaster())
    const token = ERC20.bind(poolManager.token())
    const agToken = ERC20.bind(stableMaster.agToken())

    let data = Perpetual.load(id)
    if (data == null) {
      const stableAddress = agToken._address.toHexString()
      const collatAddress = token._address.toHexString()
      const stableName = agToken.symbol()
      const collatName = token.symbol()

      data = new Perpetual(id)
      data.perpetualID = event.params.tokenId
      data.perpetualManager = event.address.toHexString()
      data.decimals = BigInt.fromI32(token.decimals())
      data.stableAddress = stableAddress
      data.collatAddress = collatAddress
      data.stableName = stableName
      data.collatName = collatName
      data.openingBlockNumber = event.block.number
      data.openingTimestamp = event.block.timestamp
    }

    data.lastUpdateBlockNumber = event.block.number
    data.lastUpdateTimestamp = event.block.timestamp
    data.owner = event.params.to.toHexString()
    // Entities can be written to the store with `.save()`
    data.save()
  }
  // for all the other case (other than liquidated it already has been updated)
  updateStableData(stableMaster, event.block)
}

export function handlePausePerp(event: ethereum.Event): void {
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  const poolManager = PoolManager.bind(Address.fromString(perpetualManager.poolManager().toHexString()))

  const id = poolManager._address.toHexString()

  let data = PoolData.load(id)
  if (data == null) {
    data = new PoolData(id)
  }

  let pauseData = PauseData.load(id)
  if (pauseData == null) {
    pauseData = new PauseData(id)
  }

  pauseData.ha = perpetualManager.paused()
  pauseData.save()

  data.pauseData = id

  data.save()
}
