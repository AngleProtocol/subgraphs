import { Address } from '@graphprotocol/graph-ts'
import { PoolData } from '../../generated/schema'
import {
  FeeBurnUpdated,
  FeeManager,
  FeeMintUpdated,
  SlippageFeeUpdated,
  SlippageUpdated
} from '../../generated/templates/FeeManagerTemplate/FeeManager'
import { PerpetualManagerFront } from '../../generated/templates/FeeManagerTemplate/PerpetualManagerFront'

export function handleFeeMintUpdated(event: FeeMintUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xBonusMalusMint = event.params._xBonusMalusMint
  data.yBonusMalusMint = event.params._yBonusMalusMint
  data.save()
}

export function handleFeeBurnUpdated(event: FeeBurnUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xBonusMalusBurn = event.params._xBonusMalusBurn
  data.yBonusMalusBurn = event.params._yBonusMalusBurn
  data.save()
}

export function handleSlippageUpdated(event: SlippageUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xSlippage = event.params._xSlippage
  data.ySlippage = event.params._ySlippage
  data.save()
}

export function handleSlippageFeeUpdated(event: SlippageFeeUpdated): void {
  // Bind contracts
  const feeManager = FeeManager.bind(Address.fromString(event.address.toHexString()))
  const perpetualManager = PerpetualManagerFront.bind(feeManager.perpetualManager())
  const poolManager = perpetualManager.poolManager().toHexString()
  let data = PoolData.load(poolManager)!
  data.xSlippageFee = event.params._xSlippageFee
  data.ySlippageFee = event.params._ySlippageFee
  data.save()
}
