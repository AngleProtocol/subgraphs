import {
  CollateralDeployed,
  MintedStablecoins,
  BurntStablecoins
} from '../../generated/templates/StableMasterTemplate/StableMaster'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFrontTemplate, SanTokenTemplate } from '../../generated/templates'
import { Contracts } from '../../generated/schema'

import { updateOracleData } from './utils'
import { Address, Bytes } from '@graphprotocol/graph-ts'

export function handleCollateralDeployed(event: CollateralDeployed): void {
  // Start indexing and tracking new contracts
  PerpetualManagerFrontTemplate.create(event.params._perpetualManager)
  SanTokenTemplate.create(event.params._sanToken)

  let contractData = new Contracts(event.params._perpetualManager.toHexString())
  contractData.save()

  contractData = new Contracts(event.params._poolManager.toHexString())
  contractData.save()

  const poolManager = PoolManager.bind(event.params._poolManager)
  updateOracleData(poolManager, event.block)
}

export function handleMint(event: MintedStablecoins): void {
  // Bind contracts
  let inputPool: Bytes = event.params._poolManager
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))

  updateOracleData(poolManager, event.block)
}

export function handleBurn(event: BurntStablecoins): void {
  // Bind contracts
  let inputPool: Bytes = event.params._poolManager
  const poolManager = PoolManager.bind(Address.fromString(inputPool.toHexString()))
  updateOracleData(poolManager, event.block)
}
