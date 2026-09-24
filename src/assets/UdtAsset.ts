import { ccc } from '@ckb-ccc/core'
import { Amount, Asset, InsufficientFundsError, MisconfiguredError } from '@kweela/ledger'

import { CkbAssetStrategy } from './CkbAssetStrategy'
import { CkbNetwork } from '../CkbNetwork'
import type { CkbChain } from '../CkbChain'

export interface UdtAssetOptions {
  /** The display code the application shows, such as KWL. */
  code: string
  decimals: number
  label?: string
  /**
   * The lock whose signature authorises issuance, as a script hash.
   *
   * This is the xUDT script's argument and therefore the token's identity: two
   * tokens with different owners are different tokens.
   */
  ownerLockHash: string
  /** Which xUDT flavour the token uses. */
  standard?: 'xudt' | 'sudt'
}

/**
 * A token the platform issues, carried in cell data under a type script.
 *
 * A UDT balance is a 16-byte number written into a cell, guarded by a type
 * script whose argument is the issuer's lock hash. Moving some of it means
 * consuming cells that hold it, writing one cell for the recipient and one for
 * whatever is left over, and paying for both out of capacity. Creating it means
 * writing a cell with no matching inputs, which the type script permits only
 * when the issuer's own lock is among the inputs.
 *
 * This is how a platform coin lives on CKB: the balance is the product's, the
 * capacity underneath it is the platform's cost of carrying it.
 */
export class UdtAsset extends CkbAssetStrategy {
  /** A UDT balance is a little-endian u128 in the first 16 bytes of cell data. */
  private static readonly AMOUNT_BYTES = 16

  readonly asset: Asset
  readonly canMint: boolean
  readonly minimumTransfer = 1n

  private readonly script: ccc.KnownScript
  private readonly ownerLockHash: string
  private type: ccc.Script | null = null

  constructor(
    chain: CkbChain,
    options: UdtAssetOptions,
    /** The issuer, when this ledger is the one that may create the token. */
    private readonly issuer: ccc.Signer | null = null,
  ) {
    super(chain)

    if (!/^0x[0-9a-fA-F]{64}$/.test(options.ownerLockHash)) {
      throw new MisconfiguredError('A token owner lock hash is 32 bytes of hexadecimal.')
    }

    this.ownerLockHash = options.ownerLockHash.toLowerCase()
    this.script = options.standard === 'sudt' ? ccc.KnownScript.SUdt : ccc.KnownScript.XUdt
    this.canMint = issuer !== null
    this.asset = new Asset({
      code: options.code,
      decimals: options.decimals,
      label: options.label ?? null,
      issuer: this.ownerLockHash,
    })
  }

  /**
   * A token output is worth the number written into its data.
   *
   * An output with no data, or one guarded by a different type script, carries
   * none of this token however much capacity it holds.
   * 
   * @param transaction 
   * @param index 
   * @returns 
   */
  amountInOutput(transaction: ccc.Transaction, index: number): Amount {
    const data = transaction.outputsData[index]
    if (!data || !transaction.outputs[index]?.type) return this.amount(0n)

    return this.amount(this.read(data))
  }

  async balanceOf(signer: ccc.Signer): Promise<{ total: Amount; pending: Amount }> {
    const type = await this.typeScript()
    let total = 0n

    for (const lock of await signer.getAddressObjs()) {
      for await (const cell of this.chain.client.findCellsByLock(lock.script, type, true)) {
        total += this.read(cell.outputData)
      }
    }

    return { total: this.amount(total), pending: this.amount(0n) }
  }

  async buildTransfer(
    signer: ccc.Signer,
    to: ccc.Script,
    amount: Amount,
  ): Promise<ccc.Transaction> {
    const type = await this.typeScript()
    const transaction = ccc.Transaction.from({
      outputs: [{ lock: to, type, capacity: CkbNetwork.MIN_UDT_CELL_CAPACITY }],
      outputsData: [this.write(amount.minor)],
    })

    await this.chain.call(() =>
      transaction.addCellDepsOfKnownScripts(this.chain.client, this.script),
    )
    await this.chain.call(() => transaction.completeInputsByUdt(signer, type))

    const held = await transaction.getInputsUdtBalance(this.chain.client, type)
    if (held < amount.minor) {
      throw new InsufficientFundsError(
        `This wallet holds ${this.amount(held).toUnits()} ${this.asset.code}, not ${amount.toUnits()}.`,
      )
    }

    await this.returnChange(transaction, signer, held - amount.minor, type)
    await this.chain.call(() => transaction.completeInputsByCapacity(signer))

    return this.payFee(transaction, signer)
  }

  /**
   * Write new tokens at a lock.
   *
   * There are no token inputs to balance against: the type script allows the
   * output to exceed them precisely because the issuer's lock is spending in
   * the same transaction, which is what `completeInputsByCapacity` on the
   * issuer arranges.
   * 
   * @param _signer 
   * @param to 
   * @param amount 
   * @returns 
   */
  async buildMint(_signer: ccc.Signer, to: ccc.Script, amount: Amount): Promise<ccc.Transaction> {
    const issuer = this.issuerOrFail()
    const type = await this.typeScript()

    const transaction = ccc.Transaction.from({
      outputs: [{ lock: to, type, capacity: CkbNetwork.MIN_UDT_CELL_CAPACITY }],
      outputsData: [this.write(amount.minor)],
    })

    await this.chain.call(() =>
      transaction.addCellDepsOfKnownScripts(this.chain.client, this.script),
    )
    await this.chain.call(() => transaction.completeInputsByCapacity(issuer))

    await this.assertIssuerIsSpending()

    return this.payFee(transaction, issuer)
  }

  /** 
   * Who signs a mint, which is the issuer rather than the recipient. 
   */
  minter(): ccc.Signer {
    return this.issuerOrFail()
  }

  /** 
   * Drop the resolved type script so a reopened ledger asks the chain again. 
   */
  override forget(): void {
    this.type = null
  }

  /** 
   * The token's type script, resolved once against the chain. 
   */
  private async typeScript(): Promise<ccc.Script> {
    if (this.type) return this.type

    this.type = await this.chain.call(() =>
      ccc.Script.fromKnownScript(this.chain.client, this.script, this.ownerLockHash),
    )

    return this.type
  }

  /** 
   * Give the sender back whatever the consumed cells held beyond the transfer.
   * 
   * @param transaction 
   * @param signer 
   * @param change 
   * @param type 
   * @returns 
   */
  private async returnChange(
    transaction: ccc.Transaction,
    signer: ccc.Signer,
    change: bigint,
    type: ccc.Script,
  ): Promise<void> {
    if (change <= 0n) return

    const lock = (await signer.getRecommendedAddressObj()).script

    transaction.addOutput(
      { lock, type, capacity: CkbNetwork.MIN_UDT_CELL_CAPACITY },
      this.write(change),
    )
  }

  /**
   * Refuse a mint the type script would reject.
   *
   * xUDT permits an output balance above the inputs only when the owner lock
   * is spending. Checking it here turns a chain verification failure into a
   * configuration error naming the issuer that is actually required.
   */
  private async assertIssuerIsSpending(): Promise<void> {
    const issuerLock = (await this.issuerOrFail().getRecommendedAddressObj()).script

    if (issuerLock.hash() === this.ownerLockHash) return

    throw new MisconfiguredError(
      `This token is issued by ${this.ownerLockHash}, which is not the key this ledger holds.`,
    )
  }

  private issuerOrFail(): ccc.Signer {
    if (!this.issuer) {
      throw new MisconfiguredError(
        `No issuer key is configured, so this ledger cannot create ${this.asset.code}.`,
      )
    }

    return this.issuer
  }

  /** 
   * The balance a cell carries.
   * 
   * @param data 
   * @returns 
   */
  private read(data: string): bigint {
    return ccc.udtBalanceFrom(data)
  }

  /** 
   * A balance, as a cell carries it.
   * 
   * @param amount 
   * @returns 
   */
  private write(amount: bigint): string {
    return ccc.hexFrom(ccc.numLeToBytes(amount, UdtAsset.AMOUNT_BYTES))
  }
}
