import { Address } from '@graphprotocol/graph-ts'
import { DECIMAL_PARAMS } from '../../../constants'
import { PoolData } from '../../generated/schema'
import {
  FeeBurnUpdated,
  FeeManager,
  FeeMintUpdated,
  HaFeesUpdated,
  SlippageFeeUpdated,
  SlippageUpdated,
} from '../../generated/templates/FeeManagerTemplate/FeeManager'
import { PerpetualManagerFront } from '../../generated/templates/FeeManagerTemplate/PerpetualManagerFront'
import { convertTokenListToDecimal, convertTokenToDecimal } from '../utils'

export function handleFeeMintUpdated(event: FeeMintUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xBonusMalusMint = convertTokenListToDecimal(event.params._xBonusMalusMint, DECIMAL_PARAMS)
  data.yBonusMalusMint = convertTokenListToDecimal(event.params._yBonusMalusMint, DECIMAL_PARAMS)
  data.save()
}

export function handleFeeBurnUpdated(event: FeeBurnUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xBonusMalusBurn = convertTokenListToDecimal(event.params._xBonusMalusBurn, DECIMAL_PARAMS)
  data.yBonusMalusBurn = convertTokenListToDecimal(event.params._yBonusMalusBurn, DECIMAL_PARAMS)
  data.save()
}

export function handleSlippageUpdated(event: SlippageUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xSlippage = convertTokenListToDecimal(event.params._xSlippage, DECIMAL_PARAMS)
  data.ySlippage = convertTokenListToDecimal(event.params._ySlippage, DECIMAL_PARAMS)
  data.save()
}

export function handleSlippageFeeUpdated(event: SlippageFeeUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xSlippageFee = convertTokenListToDecimal(event.params._xSlippageFee, DECIMAL_PARAMS)
  data.ySlippageFee = convertTokenListToDecimal(event.params._ySlippageFee, DECIMAL_PARAMS)
  data.save()
}

export function handleHaBonusMalusUpdated(event: HaFeesUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.haBonusMalusDeposit = convertTokenToDecimal(event.params._haFeeDeposit, DECIMAL_PARAMS)
  data.haBonusMalusWithdraw = convertTokenToDecimal(event.params._haFeeWithdraw, DECIMAL_PARAMS)
  data.save()
}
