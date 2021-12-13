import { Stake, Unstake } from '../../generated/schema'
import { Address, BigInt } from '@graphprotocol/graph-ts'
import { ERC20 } from '../../generated/templates/LiquidityGaugeTemplate/ERC20'
import { LiquidityGauge, Transfer } from '../../generated/templates/LiquidityGaugeTemplate/LiquidityGauge'

function isBurn(event: Transfer): boolean {
  return event.params._to.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

function isMint(event: Transfer): boolean {
  return event.params._from.equals(Address.fromString('0x0000000000000000000000000000000000000000'))
}

export function handleTransfer(event: Transfer): void {
  if (event.params._value.equals(BigInt.fromString('0'))) return

  const stakingRewardsContract = LiquidityGauge.bind(event.address)
  const token = ERC20.bind(stakingRewardsContract.lp_token())
  const decimals = token.decimals().toString()
  const name = token.name()
  const txId =
    event.transaction.hash.toHexString() +
    '_' +
    event.params._to.toHexString() +
    '_' +
    event.params._from.toHexString() +
    '_' +
    event.params._value.toString()

  if (!isBurn(event)) {
    let txData = new Stake(txId)
    txData.transactionId = event.transaction.hash.toHexString()
    txData.amount = event.params._value
    txData.decimals = decimals
    txData.sender = event.params._from.toHexString()
    txData.stakedToken = name
    txData.timestamp = event.block.timestamp
    txData.blockNumber = event.block.number
    txData.save()
  }
  if (!isMint(event)) {
    let txData = new Unstake(txId)
    txData.transactionId = event.transaction.hash.toHexString()
    txData.amount = event.params._value
    txData.decimals = decimals
    txData.sender = event.params._from.toHexString()
    txData.stakedToken = name
    txData.timestamp = event.block.timestamp
    txData.blockNumber = event.block.number
    txData.save()
  }
}
