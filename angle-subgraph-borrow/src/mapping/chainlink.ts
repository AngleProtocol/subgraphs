import { AnswerUpdated } from '../../generated/Chainlink1/ChainlinkFeed'
import { OracleByTicker, OracleData, VaultManagerData, VaultManagerList, VaultData } from '../../generated/schema'
import { _initTreasury } from './treasuryHelpers'
import {
  computeDebt,
  computeHealthFactor,
  computeTVL,
  _addVaultManagerDataToHistory,
  _addVaultDataToHistory
} from './vaultManagerHelpers'
import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import { _initAggregator } from './utils'
import {
  BASE_TOKENS,
  FAST_SYNC_THRESHOLD,
  FAST_SYNC_TIME_INTERVAL,
  ORACLE_SYNC_TIME_INTERVAL,
  STETH_ADDRESS
} from '../../../constants'
import { stETH } from '../../generated/templates/ChainlinkTemplate/stETH'
import { ChainlinkFeed } from '../../generated/templates/ChainlinkTemplate/ChainlinkFeed'
import { BorrowStaker } from '../../generated/templates/ChainlinkTemplate/BorrowStaker'
import { OracleMulti } from '../../generated/templates/ChainlinkTemplate/OracleMulti'

// Handler used to periodically refresh Oracles and Vault's HF/debt
export function handleAnswerUpdated(event: AnswerUpdated): void {
  let dataOracle = OracleData.load(event.address.toHexString())
  if (dataOracle == null) {
    const feed = ChainlinkFeed.bind(event.address)
    _initAggregator(feed, event);
  } else if (event.block.timestamp.minus(dataOracle.timestamp).lt(ORACLE_SYNC_TIME_INTERVAL)) {
    return
  } else {
    // if the in token is wstETH we also need to multiply by the rate wstETH to stETH - as we are looking at the stETH oracle because on 
    // mainnet the oracle wstETH-stETH does not exist
    let quoteAmount = BASE_TOKENS;
    if (dataOracle.tokenTicker == "wSTETH") {
      quoteAmount = stETH.bind(Address.fromString(STETH_ADDRESS)).getPooledEthByShares(BASE_TOKENS)
    }
    dataOracle.price = quoteAmount.times(event.params.current).div(BASE_TOKENS)
    dataOracle.timestamp = event.block.timestamp
    dataOracle.save()

    // Browse all vault managers concerned by the price change
    const listVM = VaultManagerList.load('1')
    if (listVM == null) return
    for (let i = 0; i < listVM.vaultManagers.length; i++) {
      const dataVM = VaultManagerData.load(listVM.vaultManagers[i])!

      // Check if this Chainlink oracle is part of the global oracle for this collateral
      // Currently only used with lp tokens
      let isLinkedOracle = false;
      let dataGlobalOracle = OracleData.load(dataVM.oracle)
      if (!(dataGlobalOracle == null)) {
        for (let k = 0; k < dataGlobalOracle.linkedOracles!.length; k++) {
          if (dataGlobalOracle.linkedOracles![k] == dataOracle.tokenTicker) {
            isLinkedOracle = true
            break
          }
        }
      }
      // Check if fast sync is applicable at this block and if this VM is concerned by price change
      // The following call is computing intensive when there is a large amount of vaults
      if (
        FAST_SYNC_THRESHOLD.lt(event.block.timestamp) &&
        event.block.timestamp.minus(dataVM.timestamp).gt(FAST_SYNC_TIME_INTERVAL) &&
        (dataVM.collateralTicker == dataOracle.tokenTicker || dataVM.agTokenTicker == dataOracle.tokenTicker || isLinkedOracle)
      ) {
        const collateralOracle = OracleByTicker.load(dataVM.collateralTicker)
        const agTokenOracle = OracleByTicker.load(dataVM.agTokenTicker)
        if (collateralOracle == null || agTokenOracle == null) {
          continue
        }
        const collateral = BorrowStaker.bind(Address.fromString(dataVM.collateral))
        const call = collateral.try_getVaultManagers()
        const currentOracleValue = call.reverted ? getCollateralClassicPriceInAgToken(collateralOracle, agTokenOracle) : getCollateralLpTokenPriceInAgToken(Address.fromString(dataVM.oracle))
        // update vaults only if the oracle value has actually moved
        if (currentOracleValue.notEqual(dataVM.oracleValue)) {
          updateVaults(event.block, currentOracleValue, dataVM)
        }
      }
    }
  }
}

function getCollateralClassicPriceInAgToken(
  collateralOracleByTicker: OracleByTicker,
  agTokenOracleByTicker: OracleByTicker
): BigInt {
  const collateralPriceInUSD = OracleData.load(collateralOracleByTicker.oracle)!.price
  // log.warning('=== colateral value in USD {}', [collateralPriceInUSD.toString()])
  const agTokenPriceInUSD = OracleData.load(agTokenOracleByTicker.oracle)!.price
  // log.warning('=== agToken value in USD {}', [agTokenPriceInUSD.toString()])
  const collateralPriceInAgToken = collateralPriceInUSD.times(BASE_TOKENS).div(agTokenPriceInUSD)
  // log.warning('=== collateral value in agToken {}', [collateralPriceInAgToken.toString()])
  return collateralPriceInAgToken
}

function getCollateralLpTokenPriceInAgToken(
  oracleAddress: Address
): BigInt {
  const oracle = OracleMulti.bind(oracleAddress)
  const oracleValue = oracle.read()
  return oracleValue
}

// Update every vault of a vaultManager with new oracle value
function updateVaults(block: ethereum.Block, newOracleValue: BigInt, dataVM: VaultManagerData): void {
  for (let i = 1; i <= dataVM.activeVaultsCount.toI32(); i++) {
    const idVault = dataVM.vaultManager.toString() + '_' + i.toString()
    const dataVault = VaultData.load(idVault)!
    // let's skip burned vaults
    if (dataVault.isActive) {
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
  _addVaultManagerDataToHistory(dataVM, block, null)
}


