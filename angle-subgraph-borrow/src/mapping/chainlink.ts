import { AnswerUpdated, ChainlinkFeed } from '../../generated/Chainlink1/ChainlinkFeed'
import { OracleByTicker, OracleData, VaultManagerData, VaultManagerList, VaultData } from '../../generated/schema'
import { _initTreasury } from './treasuryHelpers'
import {
  computeDebt,
  computeHealthFactor,
  computeTVL,
  _addVaultManagerDataToHistory,
  _addVaultDataToHistory
} from './vaultManagerHelpers'
import { log, Address, ethereum, BigInt } from '@graphprotocol/graph-ts'
import { parseOracleDescription } from './utils'
import { BASE_TOKENS } from '../../../constants'

// Handler used to periodically refresh Oracles and Vault's HF/debt
export function handleAnswerUpdated(event: AnswerUpdated): void {
  let dataOracle = OracleData.load(event.address.toHexString())
  if (dataOracle == null) {
    const feed = ChainlinkFeed.bind(event.address)
    const tokens = parseOracleDescription(feed.description(), false)

    dataOracle = new OracleData(event.address.toHexString())
    // here we assume that Chainlink always put the non-USD token first
    dataOracle.tokenTicker = tokens[0]
    dataOracle.price = event.params.current
    dataOracle.save()

    log.warning('=== new Oracle: {} {}', [tokens[0], tokens[1]])

    // OracleByTicker will point to OracleData and be indexed by token address, which will help us retrieve the second oracle in `getCollateralPriceInAgToken`
    const dataOracleByTicker = new OracleByTicker(dataOracle.tokenTicker)
    dataOracleByTicker.oracle = dataOracle.id
    dataOracleByTicker.save()
  }
  else{
    dataOracle.price = event.params.current
    dataOracle.save()

    // Browse all vault managers concerned by the price change
    const listVM = VaultManagerList.load("1")!
    for (let i = 0; i < listVM.vaultManagers.length; i++) {
      const dataVM = VaultManagerData.load(listVM.vaultManagers[i])!
      // Is this VM concerned by price change ?
      if(dataVM.collateralTicker == dataOracle.tokenTicker || dataVM.agTokenTicker == dataOracle.tokenTicker){
        const collateralOracle = OracleByTicker.load(dataVM.collateralTicker)
        const agTokenOracle = OracleByTicker.load(dataVM.agTokenTicker)
        if(collateralOracle == null || agTokenOracle == null){
          continue
        }
        const currentOracleValue = getCollateralPriceInAgToken(collateralOracle, agTokenOracle)
        // update vaults only if the oracle value has actually moved
        if(currentOracleValue.notEqual(dataVM.oracleValue)){
          updateVaults(event.block, currentOracleValue, dataVM)
        }
      }
    }
  }
}

function getCollateralPriceInAgToken(collateralOracleByTicker: OracleByTicker, agTokenOracleByTicker: OracleByTicker): BigInt {
  const collateralPriceInUSD = OracleData.load(collateralOracleByTicker.oracle)!.price
  // log.warning('=== colateral value in USD {}', [collateralPriceInUSD.toString()])
  const agTokenPriceInUSD = OracleData.load(agTokenOracleByTicker.oracle)!.price
  // log.warning('=== agToken value in USD {}', [agTokenPriceInUSD.toString()])
  const collateralPriceInAgToken = collateralPriceInUSD.times(BASE_TOKENS).div(agTokenPriceInUSD)
  // log.warning('=== collateral value in agToken {}', [collateralPriceInAgToken.toString()])
  return collateralPriceInAgToken
}

// Update every vault of a vaultManager with new oracle value
function updateVaults(block: ethereum.Block, newOracleValue: BigInt, dataVM: VaultManagerData): void {
  for (let i = 1; i <= dataVM.activeVaultsCount.toI32(); i++) {
    const idVault = dataVM.vaultManager.toString() + '_' + i.toString()
    const dataVault = VaultData.load(idVault)!
    // let's skip burned vaults
    if(dataVault.isActive){
      const previousDebt = dataVault.debt
      // update debt with interests
      dataVault.debt = computeDebt(
        dataVault.normalizedDebt,
        dataVM.interestRate,
        dataVM.interestAccumulator,
        dataVM.lastInterestAccumulatorUpdated,
        block.timestamp
      )
      // add interests accumulated to fees counter
      dataVault.fees = dataVault.fees.plus(dataVault.debt.minus(previousDebt))
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
  dataVM.tvl = computeTVL(dataVM.collateralAmount, dataVM.collateralBase, dataVM.collateralTicker)
  dataVM.oracleValue = newOracleValue
  dataVM.timestamp = block.timestamp
  dataVM.blockNumber = block.number
  dataVM.save()
  _addVaultManagerDataToHistory(dataVM, block)
}