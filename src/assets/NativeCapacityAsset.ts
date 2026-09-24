import { Amount, Asset, InvalidAmountError } from '@kweela/ledger'

import { CkbAssetStrategy } from './CkbAssetStrategy'
import { CkbNetwork } from '../CkbNetwork'
import { ccc } from '@ckb-ccc/core'

/**
 * CKB itself, counted in shannons.
 *
 * Capacity is not a number the chain keeps for an account; it is the bytes a
 * cell is allowed to occupy. That has two consequences the contract has to
 * live with. Nobody can mint it, because bytes are not issued. And an output
 * has to be large enough to pay for itself, so the smallest transfer is a
 * whole occupied cell rather than one shannon.
 */
export class NativeCapacityAsset extends CkbAssetStrategy {
  readonly asset = new Asset({ code: 'CKB', decimals: 8, label: 'Nervos CKB' })
  readonly canMint = false
  readonly minimumTransfer = CkbNetwork.MIN_CELL_CAPACITY

  /** 
   * A capacity output is worth exactly the capacity it holds.
   * 
   * @param transaction 
   * @param index 
   * @returns 
   */
  amountInOutput(transaction: ccc.Transaction, index: number): Amount {
    return this.amount(transaction.outputs[index]?.capacity ?? 0n)
  }

  async balanceOf(signer: ccc.Signer): Promise<{ total: Amount; pending: Amount }> {
    const total = await this.chain.call(() => signer.getBalance())

    return { total: this.amount(total), pending: this.amount(0n) }
  }

  async buildTransfer(
    signer: ccc.Signer,
    to: ccc.Script,
    amount: Amount,
  ): Promise<ccc.Transaction> {
    this.assertAboveTheFloor(amount)

    const transaction = ccc.Transaction.from({
      outputs: [{ lock: to, capacity: amount.minor }],
    })

    await this.chain.call(() => transaction.completeInputsByCapacity(signer))

    return this.payFee(transaction, signer)
  }

  /**
   * Refuse a transfer the chain would reject for being too small.
   *
   * Sending less than an occupied cell cannot be represented as an output at
   * all, so it is refused here with the reason rather than deeper down as a
   * verification failure.
   * 
   * @param amount 
   * @returns 
   */
  private assertAboveTheFloor(amount: Amount): void {
    if (amount.minor >= this.minimumTransfer) return

    const floor = Amount.of(this.minimumTransfer, this.asset)

    throw new InvalidAmountError(
      `A CKB transfer must be at least ${floor.toUnits()} CKB, because the cell it creates has to pay for its own bytes.`,
    )
  }
}
