import { FlashLoan } from '../../generated/FlashAngle/FlashAngle'
import { FlashLoanData } from '../../generated/schema'

// Handler used to periodically refresh Oracles and Vault's HF/debt
export function handleFlashLoan(event: FlashLoan): void {
  const token = event.params.stablecoin.toHexString()
  const receiver = event.params.receiver.toHexString()
  const amount = event.params.amount

  let dataFlash = new FlashLoanData(token + receiver + amount.toString() + event.transaction.hash.toHexString())
  dataFlash.stablecoin = token
  dataFlash.amount = amount
  dataFlash.receiver = receiver
  dataFlash.timestamp = event.block.timestamp
  dataFlash.blockNumber = event.block.number

  dataFlash.save()
}
