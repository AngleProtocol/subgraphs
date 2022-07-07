import { Address, store, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { Transfer } from '../../generated/Angle/ERC20Votes'
import { ERC20 } from '../../generated/templates/AgTokenTemplate/ERC20'
import { agToken as AgToken, UtilisationData, UtilisationHistoricalData } from '../../generated/schema'
import { historicalSlice } from './utils'

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

  // Bind contracts
  const stableName = ERC20.bind(event.address).symbol()

  const toId = event.params.to.toHexString() + '_' + event.address.toHexString()
  const fromId = event.params.from.toHexString() + '_' + event.address.toHexString()
  const utilisationId = event.address.toHexString()
  let dataUtilisation = UtilisationData.load(utilisationId)
  if (dataUtilisation == null) {
    dataUtilisation = new UtilisationData(utilisationId)
    dataUtilisation.stablecoin = event.address.toHexString()
    dataUtilisation.stableName = stableName
  }

  let dataToken: AgToken | null

  if (isMint(event)) {
    dataUtilisation.circulationSupply = dataUtilisation.circulationSupply.plus(event.params.value)
  } else {
    dataToken = AgToken.load(fromId)
    if (dataToken != null) {
      dataToken.balance = dataToken.balance.minus(event.params.value)
      if (dataToken.balance.equals(BigInt.fromString('0')) && dataToken.staked.equals(BigInt.fromString('0'))) {
        store.remove('agToken', fromId)
        dataUtilisation.holderCount = dataUtilisation.holderCount.minus(ONE)
      } else {
        dataToken.save()
      }
    }
  }

  if (isBurn(event)) {
    dataUtilisation.circulationSupply = dataUtilisation.circulationSupply.minus(event.params.value)
  } else {
    dataToken = AgToken.load(toId)
    if (dataToken == null) {
      dataToken = new AgToken(toId)
      dataToken.owner = event.params.to.toHexString()
      dataToken.token = event.address.toHexString()
      dataToken.stableName = stableName
      dataToken.balance = event.params.value
      dataToken.staked = BigInt.fromString('0')
      dataUtilisation.holderCount = dataUtilisation.holderCount.plus(ONE)
    } else {
      dataToken.balance = dataToken.balance.plus(event.params.value)
    }
    dataToken.save()
  }

  dataUtilisation.volume = dataUtilisation.volume.plus(event.params.value)

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
