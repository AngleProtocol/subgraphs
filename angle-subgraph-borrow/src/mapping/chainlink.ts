import { AnswerUpdated, ChainlinkFeed } from '../../generated/Chainlink1/ChainlinkFeed'
import { TokenPrice, OracleData, VaultManagerData, VaultManagerList, VaultData } from '../../generated/schema'
import { _initTreasury } from './treasuryHelpers'
import {
  computeDebt,
  computeHealthFactor,
  _addVaultManagerDataToHistory,
  _addVaultDataToHistory
} from './vaultManagerHelpers'
import { log, Address, ethereum, BigInt } from '@graphprotocol/graph-ts'
import { parseOracleDescription } from './utils'
import { BASE_TOKENS } from '../../../constants'

// Handler used to periodically refresh Oracles and Vault's HF/debt
export function handleAnswerUpdated(event: AnswerUpdated): void {
  log.warning('+++++ Chainlink Update !', [])

  let dataOracle = OracleData.load(event.address.toHexString())
  if (dataOracle == null) {
    const feed = ChainlinkFeed.bind(event.address)
    const tokens = parseOracleDescription(feed.description(), false)

    dataOracle = new OracleData(event.address.toHexString())
    // here we assume that Chainlink always put the non-USD token first
    dataOracle.token = tokens[0]
    dataOracle.price = event.params.current
    dataOracle.save()

    log.warning('=== new Oracle: {} {}', [dataOracle.token, tokens[1]])

    // TokenPrice will point to OracleData and be indexed by token address, which will be very practical for `getCollateralPriceInStable`
    const dataTokenPrice = new TokenPrice(dataOracle.token)
    dataTokenPrice.save()
  }
  else{
    dataOracle.price = event.params.current
    dataOracle.save()
  }

  // Browse all vault managers concerned by the price change
  const listVM = VaultManagerList.load("1")!
  for (let i = 0; i < listVM.vaultManagers.length; i++) {
    const dataVM = VaultManagerData.load(listVM.vaultManagers[i])!
    // Is this VM concerned by price change ?
    if(dataVM.collateralTicker == dataOracle.token || dataVM.targetTicker == dataOracle.token){
      const currentOracleValue = getCollateralPriceInAgToken(dataVM.collateral, dataVM.agToken)
      log.warning('=== computed value {}', [currentOracleValue.toString()])
      // update vaults only if the oracle value has actually moved
      if(currentOracleValue.notEqual(dataVM.oracleValue)){
        updateVaults(event.block, currentOracleValue, dataVM)
      }
    }
  }
}

function getCollateralPriceInAgToken(collateral: string, agToken: string): BigInt {
  const collateralPrice = OracleData.load(TokenPrice.load(collateral)!.oracle)!.price
  log.warning('=== value in USD {}', [collateralPrice.toString()])
  const agTokenPrice = OracleData.load(TokenPrice.load(agToken)!.oracle)!.price
  log.warning('=== AG value in USD {}', [agTokenPrice.toString()])
  return collateralPrice.times(BASE_TOKENS).div(agTokenPrice)
}

// Update every vault of a vaultManager with new oracle value
function updateVaults(block: ethereum.Block, newOracleValue: BigInt, dataVM: VaultManagerData): void {
  for (let i = 0; i < dataVM.activeVaultsCount.toI32(); i++) {
    const idVault = dataVM.vaultManager.toString() + '_' + i.toString()
    const dataVault = VaultData.load(idVault)!
    // let's skip burned vaults
    if(dataVault.isActive){
      // update debt with interests
      dataVault.debt = computeDebt(
        dataVault.normalizedDebt,
        dataVM.interestRate,
        dataVM.interestAccumulator,
        dataVM.lastInterestAccumulatorUpdated,
        block.timestamp
      )
      // recompute vault's health factor
      dataVault.healthFactor = computeHealthFactor(
        dataVault.collateralAmount,
        dataVM.collateralBase,
        newOracleValue,
        dataVault.debt,
        dataVM.collateralFactor
      )
      dataVault.timestamp = block.timestamp
      dataVault.blockNumber = block.number
      dataVault.save()
      _addVaultDataToHistory(dataVault, block)
    }
  }

  // update dataVM as well
  dataVM.oracleValue = newOracleValue
  dataVM.timestamp = block.timestamp
  dataVM.blockNumber = block.number
  dataVM.save()
  _addVaultManagerDataToHistory(dataVM, block)
}