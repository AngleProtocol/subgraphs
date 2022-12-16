import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import { Treasury } from '../../generated/templates/TreasuryTemplate/Treasury'
import { AgToken } from '../../generated/templates/TreasuryTemplate/AgToken'
import { TreasuryData, TreasuryHistoricalData } from '../../generated/schema'
import { getToken, historicalSlice } from './utils'

import { log } from '@graphprotocol/graph-ts'
import { convertTokenToDecimal } from '../utils'
import { DECIMAL_PARAMS, ZERO_BD } from '../../../constants'

export function extractArray(
  thisArg: Treasury,
  getter: (this: Treasury, param0: BigInt) => ethereum.CallResult<Address>
): Address[] {
  let array: Address[]
  for (let i = 0; i < getter.length; i++) {
    let result = getter.call(thisArg, BigInt.fromI32(i))
    if (result.reverted) {
      break
    }
    array.push(result.value)
  }
  return array
}

export function _initTreasury(address: Address, block: ethereum.Block): void {
  const treasury = Treasury.bind(address)
  const agToken = AgToken.bind(treasury.stablecoin())
  const agTokenInfo = getToken(agToken._address)
  log.warning('+++++ Init Treasury {} for stablecoin {}', [address.toHexString(), treasury.stablecoin().toHexString()])
  // Start indexing and tracking new contract
  // TreasuryTemplate.create(address)

  const id = address.toHexString()
  let data = new TreasuryData(id)

  data.treasury = address.toHexString()
  data.agToken = treasury.stablecoin().toHexString()

  data.badDebt = convertTokenToDecimal(treasury.badDebt(), agTokenInfo.decimals)
  data.surplusBuffer = convertTokenToDecimal(treasury.surplusBuffer(), agTokenInfo.decimals)
  data.surplusForGovernance = convertTokenToDecimal(treasury.surplusForGovernance(), DECIMAL_PARAMS)
  data.surplusManager = treasury.surplusManager().toHexString()

  data.surplus = ZERO_BD
  data.governanceProfits = ZERO_BD

  data.blockNumber = block.number
  data.timestamp = block.timestamp
  data.save()

  _addTreasuryDataToHistory(data, block)
}

export function _addTreasuryDataToHistory(data: TreasuryData, block: ethereum.Block): void {
  const idHistorical = data.id + '_' + historicalSlice(block).toString()
  let dataHistorical = TreasuryHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new TreasuryHistoricalData(idHistorical)
  }

  dataHistorical.treasury = data.treasury
  dataHistorical.agToken = data.agToken
  dataHistorical.badDebt = data.badDebt
  dataHistorical.surplusBuffer = data.surplusBuffer
  dataHistorical.surplus = data.surplus
  dataHistorical.surplusForGovernance = data.surplusForGovernance
  dataHistorical.surplusManager = data.surplusManager
  dataHistorical.blockNumber = data.blockNumber
  dataHistorical.timestamp = data.timestamp
  dataHistorical.save()
}
