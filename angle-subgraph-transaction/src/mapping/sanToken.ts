import { ethereum, Address, BigInt } from '@graphprotocol/graph-ts'
import { Transfer } from '../../generated/templates/SanTokenTemplate/ERC20'
import { Deposit, Withdraw } from '../../generated/schema'
import { PoolManager } from '../../generated/templates/StableMasterTemplate/PoolManager'
import { ERC20 } from '../../generated/templates/SanTokenTemplate/ERC20'
import { StableMaster } from '../../generated/templates/StableMasterTemplate/StableMaster'
import { SanToken } from '../../generated/templates/SanTokenTemplate/SanToken'

import { updateStableData, _updatePoolData } from './utils'
import { BASE_PARAMS, BASE_TOKENS } from '../constants'

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
  const SanTokenCo = SanToken.bind(event.address)
  const poolManager = PoolManager.bind(SanTokenCo.poolManager())
  const stableMaster = StableMaster.bind(poolManager.stableMaster())
  const token = ERC20.bind(poolManager.token())

  // Read names and sanRate
  const stableName = ERC20.bind(stableMaster.agToken()).symbol()
  const collatName = token.symbol()

  const sanRate = stableMaster.collateralMap(poolManager._address).value5
  const slippage = stableMaster.collateralMap(poolManager._address).value7.slippage

  // update protocol data entities in case of a mint or a brun
  if (isMint(event) || isBurn(event)) {
    updateStableData(stableMaster, event.block)
    updatePoolData(poolManager, event.block)
  }

  if (isMint(event)) {
    const id =
      event.transaction.hash.toHexString() + '_' + event.address.toHexString() + '_' + event.params.to.toHexString()
    let depositData = new Deposit(id)
    depositData.transactionId = event.transaction.hash.toHexString()
    depositData.minted = event.params.value
    depositData.sender = event.transaction.from.toHexString()
    depositData.recipient = event.params.to.toHexString()
    depositData.amount = event.params.value.times(sanRate).div(BASE_TOKENS)
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
    withdrawData.burned = event.params.value
    withdrawData.sender = event.transaction.from.toHexString()
    withdrawData.recipient = event.params.from.toHexString()
    withdrawData.timestamp = event.block.timestamp
    withdrawData.blockNumber = event.block.number
    withdrawData.amount = event.params.value
      .times(BASE_PARAMS.minus(slippage))
      .times(sanRate)
      .div(BASE_TOKENS)
      .div(BASE_PARAMS)
    withdrawData.collatName = collatName
    withdrawData.stableName = stableName

    withdrawData.save()
  }
}
