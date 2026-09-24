import { ccc } from '@ckb-ccc/core'
import { Amount, type Asset } from '@kweela/ledger'

import type { CkbChain } from '../CkbChain'

/**
 * How value is counted and moved on CKB.
 *
 * CKB holds two quite different things. Capacity is the chain's own asset: a
 * cell owns bytes, and owning bytes is owning CKB, so nobody can create it and
 * the smallest cell is the smallest transfer. A token is a balance written into
 * a cell's data under a type script, so an issuer can create it and a transfer
 * is a matter of rewriting that number across cells.
 *
 * Both answer the same questions - what does this wallet hold, and what
 * transaction moves some of it - which is the whole of what the ledger above
 * needs. Everything that differs lives behind these two methods.
 */
export abstract class CkbAssetStrategy {
  constructor(protected readonly chain: CkbChain) { }

  /** 
   * What the ledger denominates balances in. 
   */
  abstract readonly asset: Asset

  /** 
   * Whether the ledger can bring value into existence. 
   */
  abstract readonly canMint: boolean

  /**
   * The least that can be moved, in minor units.
   *
   * Capacity has a floor because an output must pay for its own bytes. A token
   * balance has none.
   */
  abstract readonly minimumTransfer: bigint

  /** 
   * What one wallet holds.
   * 
   * @param signer 
   */
  abstract balanceOf(signer: ccc.Signer): Promise<{ total: Amount; pending: Amount }>

  /** 
   * A transaction that moves `amount` from the signer to a lock.
   * 
   * @param signer 
   * @param to 
   * @param amount 
   */
  abstract buildTransfer(
    signer: ccc.Signer,
    to: ccc.Script,
    amount: Amount,
  ): Promise<ccc.Transaction>

  /** 
   * A transaction that brings `amount` into existence at a lock.
   * 
   * @param signer 
   * @param to 
   * @param amount 
   */
  buildMint?(signer: ccc.Signer, to: ccc.Script, amount: Amount): Promise<ccc.Transaction>

  /**
   * What one output of a settled transaction carries, in this asset.
   *
   * Reading a movement back off the chain means asking the same question in
   * reverse: a capacity output is worth the capacity it holds, and a token
   * output is worth the number written into its data. Without this, a lookup
   * can only report the transaction's total size rather than what moved.
   * 
   * @param transaction 
   * @param index 
   */
  abstract amountInOutput(transaction: ccc.Transaction, index: number): Amount

  /** 
   * Drop anything cached against the chain. Called when the ledger closes. 
   */
  forget?(): void

  /** 
   * Minor units of this strategy's asset.
   * 
   * @param minor 
   * @returns 
   */
  protected amount(minor: bigint): Amount {
    return Amount.of(minor, this.asset)
  }

  /** 
   * Pay for the transaction out of the signer's capacity.
   * 
   * @param transaction 
   * @param signer 
   * @returns 
   */
  protected async payFee(
    transaction: ccc.Transaction,
    signer: ccc.Signer,
  ): Promise<ccc.Transaction> {
    await transaction.completeFeeBy(signer, await this.chain.feeRate())

    return transaction
  }
}
