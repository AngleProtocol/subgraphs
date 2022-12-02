import { ethereum, Address, BigDecimal } from '@graphprotocol/graph-ts'
import {
  BoundsPerpetualUpdated,
  KeeperFeesCapUpdated,
  KeeperFeesClosingUpdated,
  KeeperFeesLiquidationRatioUpdated,
  KeeperTransferred,
  PerpetualClosed,
  PerpetualOpened,
  PerpetualsForceClosed,
  PerpetualUpdated,
  TargetAndLimitHAHedgeUpdated,
  Transfer
} from '../../generated/templates/PerpetualManagerFrontTemplate/PerpetualManagerFront'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import {
  HAFeesUpdated,
  PerpetualManagerFront
} from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { KeeperReward, Perpetual, PerpetualOpen, PerpetualUpdate, PoolData, PauseData, PerpetualClose } from '../../generated/schema'

import {
  updateStableData,
  _computeHedgeRatio,
  _getDepositFees,
  _updatePoolData,
  _getFeesClosePerp,
  _getFeesLiquidationPerp,
  _getForceCloseFees,
  _updateGainPoolData,
  _getFeesOpenPerp,
  updateOracleData,
  getToken
} from './utils'
import { DECIMAL_PARAMS, DECIMAL_TOKENS, ONE_BD, ZERO_BD } from '../../../constants'
import { convertTokenListToDecimal, convertTokenToDecimal } from '../utils'

function updatePoolData(poolManager: PoolManager, block: ethereum.Block, add: boolean, margin: BigDecimal): void {
  const data = _updatePoolData(poolManager, block, add, margin)
  data.save()
}

export function handleOpeningPerpetual(event: PerpetualOpened): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const collateralInfo = getToken(Address.fromString(poolData.collateral))

  const margin = convertTokenToDecimal(event.params._margin, collateralInfo.decimals)
  const committedAmount = convertTokenToDecimal(event.params._committedAmount, collateralInfo.decimals)
  const entryRate = convertTokenToDecimal(event.params._entryRate, DECIMAL_TOKENS)

  updatePoolData(poolManager, event.block, true, margin)
  const fee = _getFeesOpenPerp(perpetualManager, poolManager, event)

  const id = event.address.toHexString() + '_' + event.params._perpetualID.toHexString()
  let data = Perpetual.load(id)!
  data.margin = margin
  data.committedAmount = committedAmount
  data.entryRate = entryRate
  data.liquidationPrice = committedAmount
    .times(entryRate)
    .div(
      margin.plus(
        committedAmount.times(ONE_BD.minus(poolData.maintenanceMargin))
      )
    )
  data.fees = fee
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
  txData.entryRate = entryRate
  txData.margin = margin
  txData.committedAmount = committedAmount
  txData.fees = fee
  txData.collatName = data.collatName
  txData.stableName = data.stableName
  txData.timestamp = event.block.timestamp
  txData.blockNumber = event.block.number
  txData.save()

  _updateGainPoolData(poolManager, event.block, fee)

}

export function handleUpdatingPerpetual(event: PerpetualUpdated): void {
  const id = event.address.toHexString() + '_' + event.params._perpetualID.toHexString()
  const data = Perpetual.load(id)!
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const collateralInfo = getToken(Address.fromString(poolData.collateral))

  const margin = convertTokenToDecimal(event.params._margin, collateralInfo.decimals)
  // updat§e total margin accordingly
  const add = margin.ge(data.margin)
  const updateMargin = add ? margin.minus(data.margin) : data.margin.minus(margin)

  data.margin = margin
  data.lastUpdateTimestamp = event.block.timestamp
  data.lastUpdateBlockNumber = event.block.number
  // entry rate should always be non null as the perp is already opened
  data.liquidationPrice = data.committedAmount
    .times(data.entryRate)
    .div(margin.plus(data.committedAmount.times(ONE_BD.minus(poolData.maintenanceMargin))))

  data.save()

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
  txData.margin = margin
  txData.collatName = poolData.collatName
  txData.stableName = poolData.stableName
  txData.timestamp = event.block.timestamp
  txData.blockNumber = event.block.number
  txData.save()

  updatePoolData(poolManager, event.block, add, updateMargin)
}

export function handleClosingPerpetual(event: PerpetualClosed): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const collateralInfo = getToken(Address.fromString(poolData.collateral))

  const id = event.address.toHexString() + '_' + event.params._perpetualID.toHexString()

  const closeAmount = convertTokenToDecimal(event.params._closeAmount, collateralInfo.decimals)
  const data = Perpetual.load(id)!
  data.closeAmount = closeAmount
  data.status = 'close'
  const fee = _getFeesClosePerp(perpetualManager, poolManager._address, data)
  data.fees = data.fees.plus(fee)
  data.save()

  const txData = PerpetualClose.load(id)!
  txData.sender = event.transaction.from.toHexString()
  txData.closeAmount = closeAmount
  txData.status = 'close'
  txData.fees = fee
  txData.save()

  _updateGainPoolData(poolManager, event.block, fee)
}

export function handleForceClose(event: PerpetualsForceClosed): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const collateralInfo = getToken(Address.fromString(poolData.collateral))
  const stableMaster = StableMaster.bind(poolManager.stableMaster())

  let totalCloseFee = ZERO_BD
  let totalKeeperLiquidationFee = ZERO_BD
  let totalProtocolLiquidationFee = ZERO_BD
  for (let i = 0; i < event.params.perpetualIDs.length; i++) {
    const id = event.address.toHexString() + '_' + event.params.perpetualIDs[i].toHexString()
    let data = Perpetual.load(id)!

    let txData = PerpetualClose.load(id)
    // this can happen if the keeper try to close or liquidate a perpetual that can't be
    if (txData !== null) {
      const netCashOutAmount = convertTokenToDecimal(event.params.ownerAndCashOut[i].netCashOutAmount, collateralInfo.decimals)
      data.closeAmount = netCashOutAmount
      const status = netCashOutAmount.gt(ZERO_BD)
        ? 'forceClose'
        : 'liquidate'
      data.status = status
      data.keeperAddress = event.transaction.from.toHexString()

      txData.closeAmount = netCashOutAmount
      txData.status = status
      txData.save()

      if (netCashOutAmount.gt(ZERO_BD)) {
        totalCloseFee = totalCloseFee.plus(_getFeesClosePerp(perpetualManager, poolManager._address, data))
      } else {
        const fees = _getFeesLiquidationPerp(perpetualManager, poolManager._address, data, collateralInfo)
        totalKeeperLiquidationFee = totalKeeperLiquidationFee.plus(fees[1])
        totalProtocolLiquidationFee = totalProtocolLiquidationFee.plus(fees[0])
      }
    }
    data.save()
  }

  const totalHedgeAmount = convertTokenToDecimal(perpetualManager.totalHedgeAmount(), DECIMAL_TOKENS)
  const collatData = stableMaster.collateralMap(poolManager._address)
  const stocksUsers = convertTokenToDecimal(collatData.value4, collateralInfo.decimals)
  const hedgeRatio = _computeHedgeRatio(perpetualManager, stocksUsers, totalHedgeAmount)

  const fees = _getForceCloseFees(poolManager._address, hedgeRatio, totalCloseFee)

  if (
    fees[0].plus(totalProtocolLiquidationFee).gt(ZERO_BD) ||
    fees[1].plus(totalKeeperLiquidationFee).gt(ZERO_BD)
  )
    _updateGainPoolData(
      poolManager,
      event.block,
      fees[0].plus(totalProtocolLiquidationFee),
      fees[1].plus(totalKeeperLiquidationFee)
    )

  const tokenInfo = getToken(poolManager.token())
  let keeperData = new KeeperReward(event.transaction.hash.toHexString())
  keeperData.reward = convertTokenToDecimal(event.params.reward, tokenInfo.decimals)
  keeperData.token = tokenInfo.id
  keeperData.address = event.params.keeper.toHexString()
  keeperData.timestamp = event.block.number
  keeperData.blockNumber = event.block.timestamp
  keeperData.save()
}

export function handleLiquidatePerpetuals(event: KeeperTransferred): void {
  const perpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(perpetualManager.poolManager())
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const tokenInfo = getToken(poolManager.token())

  const liquidationFees = convertTokenToDecimal(event.params.liquidationFees, tokenInfo.decimals)
  let keeperData = new KeeperReward(event.transaction.hash.toHexString())
  keeperData.reward = liquidationFees
  keeperData.token = tokenInfo.id
  keeperData.address = event.params.keeperAddress.toHexString()
  keeperData.timestamp = event.block.number
  keeperData.blockNumber = event.block.timestamp
  keeperData.save()


  const approxProtocolLiquidateFee = liquidationFees
    .times(ONE_BD.minus(poolData.keeperFeesLiquidationRatio))
    .div(poolData.keeperFeesLiquidationRatio)

  if (approxProtocolLiquidateFee.gt(ZERO_BD) || liquidationFees.gt(ZERO_BD))
    _updateGainPoolData(poolManager, event.block, approxProtocolLiquidateFee, liquidationFees)
}

/// @dev This event will always be handle before any other event on a perpetual
/// The chronology is core to track any close/liquidation/force close.
export function handleTransfer(event: Transfer): void {
  const PerpetualManager = PerpetualManagerFront.bind(event.address)
  const poolManager = PoolManager.bind(PerpetualManager.poolManager())
  const poolData = PoolData.load(poolManager._address.toHexString())!
  const stableMaster = StableMaster.bind(Address.fromString(poolData.stableMaster))

  updateOracleData(poolManager, event.block)

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
    const collateralInfo = getToken(Address.fromString(poolData.collateral))
    const stablecoinInfo = getToken(Address.fromString(poolData.stablecoin))

    let data = Perpetual.load(id)
    if (data == null) {
      const stableAddress = stablecoinInfo.id
      const collatAddress = collateralInfo.id
      const stableName = stablecoinInfo.symbol
      const collatName = collateralInfo.symbol

      data = new Perpetual(id)
      data.perpetualID = event.params.tokenId
      data.perpetualManager = event.address.toHexString()
      data.decimals = collateralInfo.decimals
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

export function handleHAFeesUpdated(event: HAFeesUpdated): void {
  // Bind contracts
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  let inputPool = perpetualManager.poolManager().toHexString()

  let data = PoolData.load(inputPool)!
  if (event.params.deposit > 0) {
    data.xHAFeesDeposit = convertTokenListToDecimal(event.params._xHAFees, DECIMAL_PARAMS)
    data.yHAFeesDeposit = convertTokenListToDecimal(event.params._yHAFees, DECIMAL_PARAMS)
  } else {
    data.xHAFeesWithdraw = convertTokenListToDecimal(event.params._xHAFees, DECIMAL_PARAMS)
    data.yHAFeesWithdraw = convertTokenListToDecimal(event.params._yHAFees, DECIMAL_PARAMS)
  }
  data.save()
}

export function handleBoundsPerpetualUpdated(event: BoundsPerpetualUpdated): void {
  // Bind contracts
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  let inputPool = perpetualManager.poolManager().toHexString()

  let data = PoolData.load(inputPool)!
  data.maxLeverage = convertTokenToDecimal(event.params._maxLeverage, DECIMAL_PARAMS)
  data.maintenanceMargin = convertTokenToDecimal(event.params._maintenanceMargin, DECIMAL_PARAMS)
  data.save()
}

export function handleTargetAndLimitHAHedgeUpdated(event: TargetAndLimitHAHedgeUpdated): void {
  // Bind contracts
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  let inputPool = perpetualManager.poolManager().toHexString()

  let data = PoolData.load(inputPool)!
  data.targetHAHedge = convertTokenToDecimal(event.params._targetHAHedge, DECIMAL_PARAMS)
  data.limitHAHedge = convertTokenToDecimal(event.params._limitHAHedge, DECIMAL_PARAMS)
  data.save()
}

export function handleKeeperFeesLiquidationRatioUpdated(event: KeeperFeesLiquidationRatioUpdated): void {
  // Bind contracts
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  let inputPool = perpetualManager.poolManager().toHexString()

  let data = PoolData.load(inputPool)!
  data.keeperFeesLiquidationRatio = convertTokenToDecimal(event.params._keeperFeesLiquidationRatio, DECIMAL_PARAMS)
  data.save()
}

export function handleKeeperFeesCapUpdated(event: KeeperFeesCapUpdated): void {
  // Bind contracts
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  let inputPool = perpetualManager.poolManager().toHexString()

  const data = PoolData.load(inputPool)!
  data.keeperFeesLiquidationCap = convertTokenToDecimal(event.params._keeperFeesLiquidationCap, data.decimals)
  data.keeperFeesClosingCap = convertTokenToDecimal(event.params._keeperFeesClosingCap, data.decimals)
  data.save()
}

export function handleKeeperFeesClosingUpdated(event: KeeperFeesClosingUpdated): void {
  // Bind contracts
  const perpetualManager = PerpetualManagerFront.bind(Address.fromString(event.address.toHexString()))
  let inputPool = perpetualManager.poolManager().toHexString()

  let data = PoolData.load(inputPool)!
  data.xKeeperFeesClosing = convertTokenListToDecimal(event.params.xKeeperFeesClosing, DECIMAL_PARAMS)
  data.yKeeperFeesClosing = convertTokenListToDecimal(event.params.yKeeperFeesClosing, DECIMAL_PARAMS)

  data.save()
}