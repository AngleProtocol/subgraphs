import { ethereum, BigInt, log } from '@graphprotocol/graph-ts'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { ERC20 } from '../../generated/templates/StableMasterTemplate/ERC20'
import { SanToken } from '../../generated/templates/StableMasterTemplate/SanToken'
import { AgToken as AgTokenContract } from '../../generated/templates/StableMasterTemplate/AgToken'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { PerpetualManagerFront } from '../../generated/templates/StableMasterTemplate/PerpetualManagerFront'
import { Oracle, Oracle__readAllResult } from '../../generated/templates/StableMasterTemplate/Oracle'
import { PoolData, StableData, StableHistoricalData, PoolHistoricalData, Perpetual, FeeData, OracleByTicker, FeeHistoricalData } from '../../generated/schema'
import { BASE_PARAMS, BASE_TOKENS, BLOCK_UPDATE_POOL_MANAGER_ESTIMATED_APR, ROUND_COEFF, ZERO } from '../../../constants'
import { StableMaster__collateralMapResultFeeDataStruct } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { PerpetualOpened } from '../../generated/templates/PerpetualManagerFrontTemplate/PerpetualManagerFront'
import { ChainlinkTemplate } from '../../generated/templates'
import { ChainlinkProxy } from '../../generated/templates/ChainlinkTemplate/ChainlinkProxy'
import { getCollateralPrice } from './chainlink'

export function historicalSlice(block: ethereum.Block): BigInt {
  const timestamp = block.timestamp
  // we round to the closest hour
  const hourId = timestamp.div(ROUND_COEFF)
  const hourStartTimestamp = hourId.times(ROUND_COEFF)

  return hourStartTimestamp
}
