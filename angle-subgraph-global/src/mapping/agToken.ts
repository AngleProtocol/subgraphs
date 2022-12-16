import { Address, store, BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import { TreasuryTemplate } from '../../generated/templates'
import { ERC20, Transfer } from '../../generated/templates/AgTokenTemplate/ERC20'
import { TreasuryUpdated, MinterToggled } from '../../generated/templates/AgTokenTemplate/AgToken'
import { agToken as AgToken, UtilisationData, UtilisationHistoricalData, FeeData, FeeHistoricalData, TreasuryData, VaultManagerList } from '../../generated/schema'
import { _initTreasury } from './treasuryHelpers'
import { historicalSlice } from './utils'
import { convertTokenToDecimal } from '../utils'
import { ZERO_BD } from '../../../constants'

const ONE = BigInt.fromI32(1)

function _addUtilisationDataToHistory(data: UtilisationData, block: ethereum.Block): void {
  const idHistorical = data.id + '_' + historicalSlice(block).toString()
  let dataHistorical = UtilisationHistoricalData.load(idHistorical)
  if (dataHistorical == null) {
    dataHistorical = new UtilisationHistoricalData(idHistorical)
  }

  dataHistorical.stablecoin = data.stablecoin
  dataHistorical.stableName = data.stableName
  dataHistorical.circulationSupply = data.circulationSupply
  dataHistorical.volume = data.volume
  dataHistorical.txCount = data.txCount
  dataHistorical.holderCount = data.holderCount

  dataHistorical.blockNumber = data.blockNumber
  dataHistorical.timestamp = data.timestamp
  dataHistorical.save()
}

function isBurn(event: Transfer): boolean {
  return event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function isMint(event: Transfer): boolean {
  return event.params.from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function handleTransfer(event: Transfer): void {
  // Do nothing if the transfer is void
  if (event.params.value.equals(BigInt.fromString('0'))) return

  const toId = event.params.to.toHexString() + '_' + event.address.toHexString()
  const fromId = event.params.from.toHexString() + '_' + event.address.toHexString()
  const utilisationId = event.address.toHexString()
  let dataUtilisation = UtilisationData.load(utilisationId)
  if (dataUtilisation == null) {
    dataUtilisation = new UtilisationData(utilisationId)
    dataUtilisation.stablecoin = event.address.toHexString()
    dataUtilisation.stableName = ERC20.bind(event.address).symbol()
    dataUtilisation.decimals = BigInt.fromI32(ERC20.bind(event.address).decimals())
  }

  let dataToken: AgToken | null
  let decimalValue = convertTokenToDecimal(event.params.value, dataUtilisation.decimals)

  if (isMint(event)) {
    dataUtilisation.circulationSupply = dataUtilisation.circulationSupply.plus(decimalValue)
  } else {
    dataToken = AgToken.load(fromId)
    if (dataToken != null) {
      dataToken.balance = dataToken.balance.minus(decimalValue)
      if (dataToken.balance.equals(ZERO_BD) && dataToken.staked.equals(ZERO_BD)) {
        store.remove('agToken', fromId)
        dataUtilisation.holderCount = dataUtilisation.holderCount.minus(ONE)
      } else {
        dataToken.save()
      }
    }
  }

  if (isBurn(event)) {
    dataUtilisation.circulationSupply = dataUtilisation.circulationSupply.minus(decimalValue)
  } else {
    dataToken = AgToken.load(toId)
    if (dataToken == null) {
      dataToken = new AgToken(toId)
      dataToken.owner = event.params.to.toHexString()
      dataToken.token = event.address.toHexString()
      dataToken.stableName = dataUtilisation.stableName
      dataToken.balance = decimalValue
      dataToken.staked = ZERO_BD
      dataUtilisation.holderCount = dataUtilisation.holderCount.plus(ONE)
    } else {
      dataToken.balance = dataToken.balance.plus(decimalValue)
    }
    dataToken.save()
  }

  dataUtilisation.volume = dataUtilisation.volume.plus(decimalValue)

  const tx = event.transaction.hash.toHexString()
  if (tx != dataUtilisation._lastTx) {
    dataUtilisation._lastTx = tx
    dataUtilisation.txCount = dataUtilisation.txCount.plus(ONE)
  }

  dataUtilisation.timestamp = event.block.timestamp
  dataUtilisation.blockNumber = event.block.number
  dataUtilisation.save()
  _addUtilisationDataToHistory(dataUtilisation, event.block)
}

// Borrowing module related

export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  log.warning('+++++ TreasuryUpdated for agToken:{}, treasury:{}', [event.address.toHexString(), event.params._treasury.toHexString()])

  // Try to load existing treasury for this agToken, and update it
  const id = event.params._treasury.toHexString()
  let data = TreasuryData.load(id)
  if (data == null) {
    // Start indexing and tracking new contracts if it's a new one
    TreasuryTemplate.create(event.params._treasury)
    _initTreasury(event.params._treasury, event.block)
  }

  // should be put in core borrow init
  let listVM = VaultManagerList.load("1")
  if (listVM == null) {
    let listVM = new VaultManagerList("1")
    listVM.vaultManagers = []
    listVM.save()
  }

  // Start indexing global fees
  let feeData = FeeData.load('0')
  if (feeData == null) {
    feeData = new FeeData('0')
    const feeDataHistorical = new FeeHistoricalData(historicalSlice(event.block).toString())
    feeData.blockNumber = event.block.number
    feeData.timestamp = event.block.timestamp
    feeDataHistorical.timestamp = event.block.timestamp
    feeDataHistorical.blockNumber = event.block.number

    feeData.save()
    feeDataHistorical.save()
  }
}

export function handleMinterToggled(event: MinterToggled): void {
  // Load vaultManager and kill it by setting its treasury to 0x00..00 ?
  log.warning('++++ MinterToggled', [])
}
