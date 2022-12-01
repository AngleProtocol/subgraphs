import { ethereum, BigInt, Address, BigDecimal } from '@graphprotocol/graph-ts'
import { ERC20 } from '../../generated/templates/VaultManagerTemplate/ERC20'
import { VaultManager, Transfer } from '../../generated/templates/VaultManagerTemplate/VaultManager'
import { Oracle } from '../../generated/templates/VaultManagerTemplate/Oracle'
import { VaultManagerTemplate } from '../../generated/templates'
import {
  VaultManagerData,
  VaultManagerHistoricalData,
  VaultData,
  VaultHistoricalData,
  VaultLiquidation,
  OracleByTicker,
  OracleData,
  FeeHistoricalData,
  FeeData
} from '../../generated/schema'
import { getToken, historicalSlice, parseOracleDescription } from './utils'
import { BASE_INTEREST, DECIMAL_PARAMS, DECIMAL_TOKENS, MAX_DECIMAL, ZERO_BD, ONE_BD } from '../../../constants'
import { VeBoostProxy } from '../../generated/templates/VaultManagerTemplate/VeBoostProxy'
import { ActionCounter } from '../../generated/schema'
import { convertTokenToDecimal } from '../utils'

import { log } from '@graphprotocol/graph-ts'

const ZERO = BigInt.fromI32(0)
const ONE = BigInt.fromI32(1)

export function computeLiquidationDiscount(
  dataLiquidation: VaultLiquidation,
  dataVault: VaultData,
  dataVM: VaultManagerData
): BigDecimal {
  let liquidationBoost: BigDecimal
  const x = dataVM.xLiquidationBoost
  const y = dataVM.yLiquidationBoost
  if (dataVM.veBoostProxy == '0x0000000000000000000000000000000000000000') {
    liquidationBoost = y[0]
  } else {
    const veBoostProxy = VeBoostProxy.bind(Address.fromString(dataVM.veBoostProxy))
    const adjustedBalance = convertTokenToDecimal(veBoostProxy.adjusted_balance_of(Address.fromString(dataLiquidation.txOrigin)), DECIMAL_TOKENS)

    if (adjustedBalance >= x[1]) {
      liquidationBoost = y[1]
    } else if (adjustedBalance <= x[0]) {
      liquidationBoost = y[0]
    } else {
      liquidationBoost = y[0].plus(y[1].minus(y[0]).times(adjustedBalance.minus(x[0]))).div(x[1].minus(x[0]))
    }
  }

  const collateralBeforeLiquidation = dataLiquidation.collateralBought.plus(dataVault.collateralAmount)
  // log.warning(" === {} {} {} {} {}", [collateralBeforeLiquidation.toString(), dataVM.collateralBase.toString(), dataLiquidation.oraclePrice.toString(), dataVault.debt.toString(), dataVM.collateralFactor.toString()])
  const healthFactor = computeHealthFactor(
    collateralBeforeLiquidation,
    dataLiquidation.oraclePrice,
    dataVault.debt,
    dataVM.collateralFactor
  )
  let liquidationDiscount = liquidationBoost.times(ONE_BD.minus(healthFactor))
  if (liquidationDiscount.gt(dataVM.maxLiquidationDiscount)) {
    liquidationDiscount = dataVM.maxLiquidationDiscount
  }
  return liquidationDiscount
}

export function computeDebt(
  normalizedDebt: BigDecimal,
  ratePerSecond: BigInt,
  interestAccumulator: BigInt,
  lastInterestAccumulatorUpdated: BigInt,
  timestamp: BigInt
): BigDecimal {
  const exp = timestamp.minus(lastInterestAccumulatorUpdated)
  let currentInterestAccumulator = interestAccumulator
  if (!exp.isZero() && !ratePerSecond.isZero()) {
    const ZERO = BigInt.fromI32(0)
    const ONE = BigInt.fromI32(1)
    const TWO = BigInt.fromI32(2)
    const SIX = BigInt.fromI32(6)
    const HALF_BASE_INTEREST = BASE_INTEREST.div(TWO)
    const expMinusOne = exp.minus(ONE)
    const expMinusTwo = exp.gt(TWO) ? exp.minus(TWO) : ZERO
    const basePowerTwo = ratePerSecond
      .times(ratePerSecond)
      .plus(HALF_BASE_INTEREST)
      .div(BASE_INTEREST)
    const basePowerThree = basePowerTwo
      .times(ratePerSecond)
      .plus(HALF_BASE_INTEREST)
      .div(BASE_INTEREST)
    const secondTerm = exp
      .times(expMinusOne)
      .times(basePowerTwo)
      .div(TWO)
    const thirdTerm = exp
      .times(expMinusOne)
      .times(expMinusTwo)
      .times(basePowerThree)
      .div(SIX)
    currentInterestAccumulator = interestAccumulator
      .times(
        BASE_INTEREST.plus(ratePerSecond.times(exp))
          .plus(secondTerm)
          .plus(thirdTerm)
      )
      .div(BASE_INTEREST)
  }
  return normalizedDebt.times(convertTokenToDecimal(currentInterestAccumulator, DECIMAL_PARAMS.plus(DECIMAL_TOKENS)))
}

export function computeHealthFactor(
  collateral: BigDecimal,
  oracleValue: BigDecimal,
  debt: BigDecimal,
  collateralFactor: BigDecimal
): BigDecimal {
  if (debt.equals(ZERO_BD)) {
    // avoid division by zero
    return MAX_DECIMAL
  }
  return collateral.times(collateralFactor.times(oracleValue)).div(debt)
}

// Computes USD value of a collateral amount
export function computeTVL(collateralAmount: BigDecimal, collateralTicker: string): BigDecimal {
  log.warning('=== computeTVL: ticker {}', [collateralTicker.toString()])
  log.warning('=== computeTVL: oracle {}', [OracleByTicker.load(collateralTicker)!.oracle.toString()])
  const collateralPriceUSD = OracleData.load(OracleByTicker.load(collateralTicker)!.oracle)!.price
  return collateralAmount.times(collateralPriceUSD)
}

export function extractArray(
  thisArg: VaultManager,
  getter: (this: VaultManager, param0: BigInt) => ethereum.CallResult<BigInt>
): BigDecimal[] {
  let array = new Array<BigDecimal>()
  for (let i = 0; i < getter.length; i++) {
    let result = getter.call(thisArg, BigInt.fromI32(i))
    if (result.reverted) {
      break
    }
    array.push(convertTokenToDecimal(result.value, DECIMAL_PARAMS))
  }
  return array
}

export function isBurn(event: Transfer): boolean {
  return event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function isMint(event: Transfer): boolean {
  return event.params.from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function _initVaultManager(address: Address, block: ethereum.Block): void {
  const vaultManager = VaultManager.bind(address)
  const collateralContract = ERC20.bind(vaultManager.collateral())
  const oracle = Oracle.bind(vaultManager.oracle())
  const tokens = parseOracleDescription(oracle.DESCRIPTION(), true)
  const agTokenAddress = vaultManager.stablecoin()
  const collateralInfo = getToken(collateralContract._address)
  const agTokenInfo = getToken(agTokenAddress)

  log.warning('+++++ New VaultManager: {}', [address.toHexString()])
  // Start indexing and tracking new contracts
  VaultManagerTemplate.create(address)

  const id = address.toHexString()
  let data = new VaultManagerData(id)

  // Create data point
  data.name = vaultManager.name()
  data.vaultManager = address.toHexString()
  data.agToken = vaultManager.stablecoin().toHexString()
  data.collateral = vaultManager.collateral().toHexString()
  data.collateralBase = BigInt.fromI32(10).pow(collateralContract.decimals() as u8)
  data.dust = convertTokenToDecimal(vaultManager.dust(), collateralInfo.decimals)
  data.collateralTicker = tokens[0]
  data.agTokenTicker = tokens[1]
  log.warning('=== collat {}, euro {}', [data.collateralTicker, data.agTokenTicker])
  data.treasury = vaultManager.treasury().toHexString()
  data.collateralAmount = convertTokenToDecimal(collateralContract.balanceOf(address), collateralInfo.decimals)
  data.interestAccumulator = vaultManager.interestAccumulator()
  data.lastInterestAccumulatorUpdated = vaultManager.lastInterestAccumulatorUpdated()
  // values known at init
  data.totalDebt = ZERO_BD
  data.tvl = ZERO_BD
  data.activeVaultsCount = BigInt.fromI32(0)
  data.surplus = ZERO_BD
  data.surplusFromInterests = ZERO_BD
  data.surplusFromBorrowFees = ZERO_BD
  data.surplusFromRepayFees = ZERO_BD
  data.surplusFromLiquidationSurcharges = ZERO_BD
  data.badDebt = ZERO_BD
  data.profits = ZERO_BD
  data.pendingSurplus = ZERO_BD
  data.pendingBadDebt = ZERO_BD
  data.liquidationRepayments = ZERO_BD
  // liquidations
  data.liquidationDebtsRepayed = []
  data.liquidationDebtsRemoved = []
  data.liquidationDebtsRemaining = []
  data.liquidationCollateralsBought = []
  data.liquidationCollateralsRemaining = []
  data.liquidationTimestamps = []

  data.oracleValue = convertTokenToDecimal(oracle.read(), DECIMAL_TOKENS)
  data.totalNormalizedDebt = convertTokenToDecimal(vaultManager.totalNormalizedDebt(), agTokenInfo.decimals)
  data.debtCeiling = convertTokenToDecimal(vaultManager.debtCeiling(), agTokenInfo.decimals)
  data.veBoostProxy = vaultManager.veBoostProxy().toHexString()
  data.xLiquidationBoost = extractArray(vaultManager, vaultManager.try_xLiquidationBoost)
  data.yLiquidationBoost = extractArray(vaultManager, vaultManager.try_yLiquidationBoost)
  data.collateralFactor = convertTokenToDecimal(vaultManager.collateralFactor(), DECIMAL_PARAMS)
  data.targetHealthFactor = convertTokenToDecimal(vaultManager.targetHealthFactor(), DECIMAL_PARAMS)
  data.borrowFee = convertTokenToDecimal(vaultManager.borrowFee(), DECIMAL_PARAMS)
  data.repayFee = convertTokenToDecimal(vaultManager.repayFee(), DECIMAL_PARAMS)
  data.interestRate = vaultManager.interestRate()
  data.liquidationSurcharge = convertTokenToDecimal(vaultManager.liquidationSurcharge(), DECIMAL_PARAMS)
  data.maxLiquidationDiscount = convertTokenToDecimal(vaultManager.maxLiquidationDiscount(), DECIMAL_PARAMS)
  data.blockNumber = block.number
  data.timestamp = block.timestamp
  data.save()

  // Add historical data point
  _addVaultManagerDataToHistory(data, block, null)
}

export function _addVaultManagerDataToHistory(data: VaultManagerData, block: ethereum.Block, feeData: FeeData | null): void {
  const roundedTimestamp = historicalSlice(block).toString()
  const idHistorical = data.id + '_' + roundedTimestamp
  let dataHistorical = VaultManagerHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new VaultManagerHistoricalData(idHistorical)
  }

  dataHistorical.name = data.name
  dataHistorical.vaultManager = data.vaultManager
  dataHistorical.agToken = data.agToken
  dataHistorical.collateral = data.collateral
  dataHistorical.collateralBase = data.collateralBase
  dataHistorical.dust = data.dust
  dataHistorical.agTokenTicker = data.agTokenTicker
  dataHistorical.collateralTicker = data.collateralTicker
  dataHistorical.treasury = data.treasury
  dataHistorical.collateralAmount = data.collateralAmount
  dataHistorical.interestAccumulator = data.interestAccumulator
  dataHistorical.lastInterestAccumulatorUpdated = data.lastInterestAccumulatorUpdated
  dataHistorical.totalDebt = data.totalDebt
  dataHistorical.tvl = data.tvl
  dataHistorical.activeVaultsCount = data.activeVaultsCount
  dataHistorical.surplus = data.surplus
  dataHistorical.surplusFromInterests = data.surplusFromInterests
  dataHistorical.surplusFromBorrowFees = data.surplusFromBorrowFees
  dataHistorical.surplusFromRepayFees = data.surplusFromRepayFees
  dataHistorical.surplusFromLiquidationSurcharges = data.surplusFromLiquidationSurcharges
  dataHistorical.badDebt = data.badDebt
  dataHistorical.profits = data.profits
  dataHistorical.pendingSurplus = data.pendingSurplus
  dataHistorical.pendingBadDebt = data.pendingBadDebt
  dataHistorical.oracleValue = data.oracleValue
  dataHistorical.liquidationRepayments = data.liquidationRepayments
  dataHistorical.liquidationCount = BigInt.fromI32(data.liquidationDebtsRepayed.length)
  dataHistorical.totalNormalizedDebt = data.totalNormalizedDebt
  dataHistorical.debtCeiling = data.debtCeiling
  dataHistorical.veBoostProxy = data.veBoostProxy
  dataHistorical.xLiquidationBoost = data.xLiquidationBoost
  dataHistorical.yLiquidationBoost = data.yLiquidationBoost
  dataHistorical.collateralFactor = data.collateralFactor
  dataHistorical.targetHealthFactor = data.targetHealthFactor
  dataHistorical.borrowFee = data.borrowFee
  dataHistorical.repayFee = data.repayFee
  dataHistorical.interestRate = data.interestRate
  dataHistorical.liquidationSurcharge = data.liquidationSurcharge
  dataHistorical.maxLiquidationDiscount = data.maxLiquidationDiscount
  dataHistorical.blockNumber = data.blockNumber
  dataHistorical.timestamp = data.timestamp
  dataHistorical.save()

  // Update the global revenue values
  if (feeData) {
    let feeDataHistorical = FeeHistoricalData.load(roundedTimestamp)
    if (feeDataHistorical == null) {
      feeDataHistorical = new FeeHistoricalData(roundedTimestamp)
    }
    feeDataHistorical.surplusFromInterests = feeData.surplusFromInterests
    feeDataHistorical.surplusFromBorrowFees = feeData.surplusFromBorrowFees
    feeDataHistorical.surplusFromRepayFees = feeData.surplusFromRepayFees
    feeDataHistorical.surplusFromLiquidationSurcharges = feeData.surplusFromLiquidationSurcharges
    feeDataHistorical.timestamp = block.timestamp
    feeDataHistorical.blockNumber = block.number

    feeDataHistorical.save()
  }

}

export function _addVaultDataToHistory(data: VaultData, block: ethereum.Block): void {
  const idHistorical = data.id + '_' + historicalSlice(block).toString()
  let dataHistorical = VaultHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new VaultHistoricalData(idHistorical)
  }

  dataHistorical.vaultManager = data.vaultManager
  dataHistorical.vaultID = data.vaultID
  dataHistorical.owner = data.owner
  dataHistorical.collateralAmount = data.collateralAmount
  dataHistorical.normalizedDebt = data.normalizedDebt
  dataHistorical.isActive = data.isActive
  dataHistorical.debt = data.debt
  dataHistorical.healthFactor = data.healthFactor
  dataHistorical.fees = data.fees

  dataHistorical.blockNumber = data.blockNumber
  dataHistorical.timestamp = data.timestamp
  dataHistorical.save()
}

// Helper to get an ID for actions that could happen more than once in a single Tx and can't be distinguished from each other
// e.g: borrowing the same amount on the same vault
// To avoid this issue, we count the actions of each vulnerable category in a given transaction and build a unique ID from txHash + counter
export function _getActionId(action: string, txHash: string, timestamp: BigInt): string {
  let actionCounter = ActionCounter.load('1')
  if (actionCounter == null) {
    actionCounter = new ActionCounter('1')
  } else if (actionCounter.timestamp != timestamp || actionCounter.txHash != txHash) {
    // overwrite previous actionCounter if we're in a different block or in a different transaction
    actionCounter.timestamp = timestamp
    actionCounter.txHash = txHash
    actionCounter.collateralUpdate = ZERO
    actionCounter.debtUpdate = ZERO
    actionCounter.debtTransfer = ZERO
    actionCounter.vaultTransfer = ZERO
  }
  let counter: BigInt
  if (action === 'collateralUpdate') {
    counter = actionCounter.collateralUpdate = actionCounter.collateralUpdate.plus(ONE)
  } else if (action === 'debtUpdate') {
    counter = actionCounter.debtUpdate = actionCounter.debtUpdate.plus(ONE)
  } else if (action === 'debtTransfer') {
    counter = actionCounter.debtTransfer = actionCounter.debtTransfer.plus(ONE)
  } else if (action === 'vaultTransfer') {
    counter = actionCounter.vaultTransfer = actionCounter.vaultTransfer.plus(ONE)
  } else {
    log.error('Unknown action', [])
  }

  actionCounter.save()
  return txHash + '_' + counter.toString()
}
