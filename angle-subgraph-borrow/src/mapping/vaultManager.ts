import { store, BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  VaultManager,
  AccruedToTreasury,
  CollateralAmountUpdated,
  InterestRateAccumulatorUpdated,
  FiledUint64,
  DebtCeilingUpdated,
  LiquidationBoostParametersUpdated,
  OracleUpdated,
  ToggledWhitelisting
} from '../../generated/templates/VaultManagerTemplate/VaultManager'
import { AgToken } from '../../generated/TreasuryTemplate/AgToken'
import { VaultManagerData, VaultManagerHistoricalData } from '../../generated/schema'
import { _updateVaultManager } from './utils'
import { log } from '@graphprotocol/graph-ts'

export function handleAccruedToTreasury(event: AccruedToTreasury): void {
  log.warning('+=', [])
  _updateVaultManager(event.address, event.block)
}
export function handleCollateralAmountUpdated(event: CollateralAmountUpdated): void {
  log.warning('++=', [])
  _updateVaultManager(event.address, event.block)
}
export function handleInterestRateAccumulatorUpdated(event: InterestRateAccumulatorUpdated): void {
  log.warning('+_+=', [])
  _updateVaultManager(event.address, event.block)
}
export function handleFiledUint64(event: FiledUint64): void {
  log.warning('++++=', [])
  _updateVaultManager(event.address, event.block)
}

export function handleDebtCeilingUpdated(event: DebtCeilingUpdated): void {
  log.warning('+_+_+=', [])
  _updateVaultManager(event.address, event.block)
}

export function handleLiquidationBoostParametersUpdated(event: LiquidationBoostParametersUpdated): void {
  log.warning('+_+_+=+', [])
  _updateVaultManager(event.address, event.block)
}

export function handleOracleUpdated(event: OracleUpdated): void {
  log.warning('+_+_+=+=', [])
  _updateVaultManager(event.address, event.block)
}

export function handleToggledWhitelisting(event: ToggledWhitelisting): void {
  log.warning('+_+_+=+=+', [])
  _updateVaultManager(event.address, event.block)
}
