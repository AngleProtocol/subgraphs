import { ethereum, Address, BigInt, store } from '@graphprotocol/graph-ts'
import { Deposit, Withdraw, sanToken, CapitalGain, PoolData } from '../../generated/schema'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { ERC20, Transfer } from '../../generated/templates/SanTokenTemplate/ERC20'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { SanToken } from '../../generated/templates/SanTokenTemplate/SanToken'

import { getToken, updateOracleData, updateStableData, _updatePoolData } from './utils'
import { DECIMAL_PARAMS, DECIMAL_TOKENS, ONE_BD, ZERO_BD } from '../../../constants'
import { convertTokenToDecimal } from '../utils'

function isBurn(event: Transfer): boolean {
  return event.params.to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function isMint(event: Transfer): boolean {
  return event.params.from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function updatePoolData(poolManager: PoolManager, block: ethereum.Block): void {
  const data = _updatePoolData(poolManager, block)
  data.save()
}

export function handleTransfer(event: Transfer): void {
  // Do nothing if the transfer is void
  if (event.params.value.equals(BigInt.fromString('0'))) return

  // Bind contracts
  let sanTokenInfo = getToken(event.address);
  const SanTokenCo = SanToken.bind(event.address)
  const poolManager = PoolManager.bind(SanTokenCo.poolManager())
  let poolData = PoolData.load(poolManager._address.toHexString())!
  const stableMaster = StableMaster.bind(Address.fromString(poolData.stableMaster))
  const collateralInfo = getToken(Address.fromString(poolData.collateral))
  const stablenameInfo = getToken(Address.fromString(poolData.stablecoin))

  updateOracleData(poolManager, event.block)

  // Read names and sanRate
  const stableName = stablenameInfo.symbol
  const collatName = collateralInfo.symbol

  const sanRate = convertTokenToDecimal(stableMaster.collateralMap(poolManager._address).value5, DECIMAL_TOKENS)
  const slippage = convertTokenToDecimal(stableMaster.collateralMap(poolManager._address).value7.slippage, DECIMAL_PARAMS)

  // Tx to address + contract address
  const toId = event.params.to.toHexString() + '_' + event.address.toHexString()
  // Tx from address + contract address
  const fromId = event.params.from.toHexString() + '_' + event.address.toHexString()
  //  Tx to address + pool name
  const addressToId = event.params.to.toHexString() + '_' + collatName + '_' + stableName.substr(2)
  //  Tx from address + pool name
  const addressFromId = event.params.from.toHexString() + '_' + collatName + '_' + stableName.substr(2)

  let data: sanToken | null
  let gainData: CapitalGain | null

  // update protocol data entities in case of a mint or a brun
  if (isMint(event) || isBurn(event)) {
    updateStableData(stableMaster, event.block)
    updatePoolData(poolManager, event.block)
  }

  const amount = convertTokenToDecimal(event.params.value, collateralInfo.decimals)
  if (isMint(event)) {
    const id =
      event.transaction.hash.toHexString() + '_' + event.address.toHexString() + '_' + event.params.to.toHexString()
    let depositData = new Deposit(id)
    depositData.transactionId = event.transaction.hash.toHexString()
    depositData.minted = amount
    depositData.sender = event.transaction.from.toHexString()
    depositData.recipient = event.params.to.toHexString()
    depositData.amount = amount.times(sanRate)
    depositData.timestamp = event.block.timestamp
    depositData.blockNumber = event.block.number

    const token = ERC20.bind(poolManager.token())
    const collatName = token.symbol()
    depositData.collatName = collatName
    depositData.stableName = stableName

    depositData.save()
  }

  if (isBurn(event)) {
    const id =
      event.transaction.hash.toHexString() + '_' + event.address.toHexString() + '_' + event.params.value.toString()
    let withdrawData = new Withdraw(id)
    withdrawData.transactionId = event.transaction.hash.toHexString()
    withdrawData.burned = amount
    withdrawData.sender = event.transaction.from.toHexString()
    withdrawData.recipient = event.params.from.toHexString()
    withdrawData.timestamp = event.block.timestamp
    withdrawData.blockNumber = event.block.number
    withdrawData.amount = amount
      .times(ONE_BD.minus(slippage))
      .times(sanRate)
    withdrawData.collatName = collatName
    withdrawData.stableName = stableName

    withdrawData.save()
  }

  let valueDecimal = convertTokenToDecimal(event.params.value, sanTokenInfo.decimals)
  if (!isMint(event)) {
    data = sanToken.load(fromId)
    if (data != null) {
      gainData = CapitalGain.load(addressFromId)!

      // In the lastPosition we store the value of sanToken after the transfer
      const lastPosition = data.balance
        .minus(valueDecimal)
        .times(sanRate)
      // In the gains we store the gains since last time this address was seen
      gainData.gains = gainData.gains.plus(data.balance.times(sanRate)).minus(gainData.lastPosition)
      gainData.lastPosition = lastPosition
      gainData.save()

      // Store the updated balance
      data.balance = data.balance.minus(valueDecimal)

      // If the address as no more tokens or staked token, remove the entity
      if (data.balance.equals(ZERO_BD) && data.staked.equals(ZERO_BD)) {
        store.remove('sanToken', fromId)
      } else {
        data.save()
      }
    }
  }

  if (!isBurn(event)) {
    data = sanToken.load(toId)
    gainData = CapitalGain.load(addressToId)

    const balance = data == null ? ZERO_BD : data.balance
    // In the lastPosition we store the value of sanToken after the transfer
    const lastPosition = balance
      .plus(valueDecimal)
      .times(sanRate)

    if (gainData == null) {
      gainData = new CapitalGain(addressToId)
      gainData.gains = ZERO_BD
      gainData.lastStakedPosition = ZERO_BD
    } else {
      gainData.gains = gainData.gains.plus(balance.times(sanRate)).minus(gainData.lastPosition)
    }
    gainData.lastPosition = lastPosition
    gainData.save()

    // If this address currently has no entity
    if (data == null) {
      data = new sanToken(toId)
      data.owner = event.params.to.toHexString()
      data.token = event.address.toHexString()
      data.balance = valueDecimal
      data.collatName = collatName
      data.stableName = stableName
      data.staked = ZERO_BD
    } else {
      data.balance = data.balance.plus(valueDecimal)
    }
    data.save()
  }
}
