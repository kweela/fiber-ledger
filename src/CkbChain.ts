import { ccc } from '@ckb-ccc/core'
import {
  InsufficientFundsError,
  InvalidDestinationError,
  LedgerError,
  LedgerUnavailableError,
  SettlementFailedError,
  type LedgerHealth,
  type SettlementStatus,
} from '@kweela/ledger'

import type { Owner } from '@ckb-ccc/core'
import type { CkbNetwork } from './CkbNetwork'

/**
 * What the chain can say about one movement, once it is looked up.
 */
export interface CkbTransactionFacts {
  transaction: ccc.Transaction
  status: string
  blockNumber: bigint | undefined
  reason: string | null
  /** What the transaction paid to be included, in shannons. */
  fee: bigint
  from: string | null
  to: string | null
  /** Which output carried the payment, as opposed to the change. */
  recipientIndex: number | null
  /** When the block carrying it was made, which is the only time the chain knows. */
  occurredAt: Date | null
}

/**
 * The node, and the only place its answers are believed.
 *
 * Every call a chain can refuse passes through here so that CKB's own
 * vocabulary - resolve failures, verification errors, duplicated transactions,
 * fee-rate rejections - is turned into the contract's before it travels any
 * further. Nothing above this file should ever need a `try` around a CCC type.
 */
export class CkbChain {
  readonly client: ccc.ClientJsonRpc

  /** 
   * The transport this chain opened, and is responsible for closing. 
   */
  private readonly owner: Owner<ccc.ClientJsonRpc>

  constructor(readonly network: CkbNetwork) {
    this.owner = network.open()
    this.client = this.owner.value
  }

  /**
   * Let go of the node.
   *
   * The public nodes are reached over a websocket, so a chain that is finished
   * with holds a connection open until it says so. Repeated calls are safe.
   */
  async close(): Promise<void> {
    await this.owner.dispose()
  }

  /** 
   * Whether an address is one this network can pay.
   * 
   * @param address 
   * @returns 
   */
  async parseAddress(address: string): Promise<ccc.Address> {
    try {
      const parsed = await ccc.Address.fromString(address, this.client)

      if (!address.startsWith(this.network.addressPrefix)) {
        throw new InvalidDestinationError(`${address} is not a ${this.network.name} address.`)
      }

      return parsed
    } catch (error) {
      if (LedgerError.is(error)) throw error

      throw new InvalidDestinationError(`${address} is not a CKB address.`, error)
    }
  }

  /**
   * How a movement stands, from the chain's own record of it.
   *
   * A committed transaction is not yet settled: it is settled once enough
   * blocks sit on top of it that this network stops reorganising it away.
   * 
   * @param hash 
   * @returns 
   */
  async statusOf(
    hash: string,
  ): Promise<{ status: SettlementStatus; confirmations: number | null }> {
    const response = await this.call(() => this.client.getTransaction(hash))

    if (!response) return { status: 'unknown', confirmations: null }
    if (response.status === 'rejected') return { status: 'failed', confirmations: 0 }
    if (response.status === 'pending' || response.status === 'proposed') {
      return { status: 'submitted', confirmations: 0 }
    }
    if (response.status !== 'committed') return { status: 'unknown', confirmations: null }

    const confirmations = await this.confirmationsSince(response.blockNumber)

    return {
      status: confirmations >= this.network.confirmations ? 'settled' : 'submitted',
      confirmations,
    }
  }

  /**
   * Everything a settled movement can be described by.
   *
   * A transaction on its own says what it produced but not what it consumed,
   * and the chain records when a block was made rather than when a payment was
   * sent. Resolving the inputs gives both the sender and the fee, which is the
   * difference the transaction did not carry away; the block header gives the
   * only timestamp the chain actually knows.
   * 
   * @param hash 
   * @returns 
   */
  async describe(hash: string): Promise<CkbTransactionFacts | null> {
    const found = await this.call(() => this.client.getTransactionWithHeader(hash))
    if (!found) return null

    const { transaction: response, header } = found
    const transaction = response.transaction

    const inputsCapacity = await this.call(() => transaction.getInputsCapacity(this.client)).catch(
      () => 0n,
    )
    const outputsCapacity = transaction.getOutputsCapacity()
    const from = await this.addressOfInput(transaction)
    const recipient = this.recipientIndex(transaction, from)

    return {
      transaction,
      status: response.status,
      blockNumber: response.blockNumber,
      reason: response.reason ?? null,
      /** Zero rather than negative when the inputs could not be resolved. */
      fee: inputsCapacity > outputsCapacity ? inputsCapacity - outputsCapacity : 0n,
      from,
      to: recipient === null ? null : await this.addressOfOutput(transaction, recipient),
      recipientIndex: recipient,
      occurredAt: header?.timestamp ? new Date(Number(header.timestamp)) : null,
    }
  }

  /**
   * The height the chain has reached.
   *
   * Asked through the client's own transport rather than over a fresh HTTP
   * request, because a node may be reached over a websocket and the default
   * public ones are.
   */
  async tip(): Promise<bigint> {
    const height = await this.call(async () => this.client.buildSender('get_tip_block_number')())

    return BigInt(height as string)
  }

  /** 
   * Put a signed transaction on the chain, once.
   * 
   * @param transaction 
   * @param signer 
   * @returns 
   */
  async submit(transaction: ccc.Transaction, signer: ccc.Signer): Promise<string> {
    try {
      return await signer.sendTransaction(transaction)
    } catch (error) {
      throw this.translate(error)
    }
  }

  async feeRate(): Promise<bigint> {
    return this.call(() => this.client.getFeeRate())
  }

  async health(): Promise<LedgerHealth> {
    try {
      const tip = await this.tip()

      return {
        reachable: true,
        blockHeight: Number(tip),
        detail: `${this.network.name} at ${this.network.url ?? 'the public node'}`,
      }
    } catch (error) {
      return {
        reachable: false,
        blockHeight: null,
        detail: error instanceof Error ? error.message : 'unreachable',
      }
    }
  }

  /** 
   * Run a node call, reporting unreachability as the contract describes it. 
   */
  async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      throw this.translate(error)
    }
  }

  /**
   * A CKB failure, in the contract's terms.
   *
   * A transaction the node already has is a replay arriving twice, not a
   * failure, so it is reported as one the caller can look up rather than an
   * error that loses the first attempt.
   * 
   * @param error 
   * @returns 
   */
  translate(error: unknown): LedgerError {
    if (LedgerError.is(error)) return error

    if (
      error instanceof ccc.ErrorTransactionInsufficientCapacity ||
      error instanceof ccc.ErrorTransactionInsufficientCoin
    ) {
      return new InsufficientFundsError('The wallet does not hold enough to cover this.', error)
    }

    if (error instanceof ccc.ErrorClientDuplicatedTransaction) {
      return new SettlementFailedError('The chain already has this transaction.', error)
    }

    if (error instanceof ccc.ErrorClientVerification) {
      return new SettlementFailedError('The chain refused the transaction.', error)
    }

    if (
      error instanceof ccc.ErrorClientMaxFeeRateExceeded ||
      error instanceof ccc.ErrorClientRBFRejected
    ) {
      return new SettlementFailedError('The fee the transaction offered was not accepted.', error)
    }

    if (error instanceof ccc.ErrorClientWaitTransactionTimeout) {
      return new LedgerUnavailableError('The node did not answer in time.', error)
    }

    const message = error instanceof Error ? error.message : String(error)

    return new LedgerUnavailableError(`The CKB node could not be reached: ${message}`, error)
  }

  /** 
   * Where the transaction was spent from, as an address.
   * 
   * @param transaction 
   * @returns 
   */
  private async addressOfInput(transaction: ccc.Transaction): Promise<string | null> {
    const input = transaction.inputs[0]
    if (!input) return null

    try {
      const cell = await this.client.getCell(input.previousOutput)
      if (!cell) return null

      return ccc.Address.fromScript(cell.cellOutput.lock, this.client).toString()
    } catch {
      return null
    }
  }

  private async addressOfOutput(
    transaction: ccc.Transaction,
    index: number,
  ): Promise<string | null> {
    const output = transaction.outputs[index]
    if (!output) return null

    try {
      return ccc.Address.fromScript(output.lock, this.client).toString()
    } catch {
      return null
    }
  }

  /**
   * Which output the payment went to, rather than the change.
   *
   * The first output not returning to the sender is the payment. A transaction
   * that only pays itself has no such output and reports none.
   * 
   * @param transaction 
   * @param from 
   * @returns 
   */
  private recipientIndex(transaction: ccc.Transaction, from: string | null): number | null {
    if (!from) return transaction.outputs.length ? 0 : null

    for (const [index, output] of transaction.outputs.entries()) {
      const address = ccc.Address.fromScript(output.lock, this.client).toString()
      if (address !== from) return index
    }

    return null
  }

  private async confirmationsSince(blockNumber: bigint | undefined): Promise<number> {
    if (blockNumber === undefined) return 0

    const tip = await this.tip()

    return Number(tip >= blockNumber ? tip - blockNumber + 1n : 0n)
  }
}
