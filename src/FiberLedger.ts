import { ccc } from '@ckb-ccc/core'
import {
  Amount,
  BaseLedger,
  InvalidDestinationError,
  MisconfiguredError,
  UnsupportedOperationError,
  WalletLockedError,
  WalletNotFoundError,
  type Asset,
  type BaseLedgerOptions,
  type CreateWalletInput,
  type DepositInput,
  type DepositIntent,
  type ImportWalletInput,
  type LedgerBalance,
  type LedgerCapabilities,
  type LedgerHealth,
  type LedgerTransaction,
  type LedgerWallet,
  type LedgerOperation,
  type ListTransactionsInput,
  type MintInput,
  type TransactionPage,
  type TransactionRef,
  type TransferInput,
  type WalletCustodyExport,
  type WalletRef,
  type WithdrawInput,
} from '@kweela/ledger'

import { CkbChain } from './CkbChain'
import { CkbKeyring } from './CkbKeyring'
import { CkbNetwork } from './CkbNetwork'
import { CkbAssetStrategy } from './assets/CkbAssetStrategy'
import { FiberPaymentRail, type FiberRoute } from './fiber/FiberPaymentRail'

export interface FiberLedgerOptions extends BaseLedgerOptions {
  network: CkbNetwork
  chain?: CkbChain
  /** What is being counted: CKB capacity, or a token the platform issues. */
  asset: CkbAssetStrategy
  /** The off-chain rail, when this deployment runs a Fiber node. */
  fiber?: FiberPaymentRail | null
  /**
   * The Fiber node that can be reached for a given destination address.
   *
   * Returning null means the destination has no channel route, and the
   * transfer settles on chain instead.
   */
  fiberRouteFor?: (address: string) => Promise<FiberRoute | null> | FiberRoute | null
}

/**
 * A CKB ledger, behind a small set of operations that name no chain.
 *
 * A wallet here is a secp256k1 key and the address it controls, and the
 * address is the reference: CKB has no account beyond the cells a lock owns,
 * so there is nothing else durable to name it by. The application keeps the
 * key sealed and hands it back for anything that signs.
 *
 * What is being counted is the strategy's business, not this class's. Capacity
 * and an issued token differ in how a balance is read and how an output is
 * built, and in nothing else the contract can see.
 */
export class FiberLedger extends BaseLedger {
  /** A movement that went over a channel rather than the chain. */
  private static readonly CHANNEL_PREFIX = 'fiber:'

  readonly name = 'fiber'
  readonly label = 'Fiber Ledger'
  readonly capabilities: LedgerCapabilities

  private readonly chain: CkbChain
  private readonly network: CkbNetwork
  private readonly keyring: CkbKeyring
  private readonly strategy: CkbAssetStrategy
  private readonly fiber: FiberPaymentRail | null
  private readonly routeFor: FiberLedgerOptions['fiberRouteFor']

  constructor(options: FiberLedgerOptions) {
    super(options)

    this.network = options.network
    this.chain = options.chain ?? new CkbChain(options.network)
    this.keyring = new CkbKeyring(options.network)
    this.strategy = options.asset
    this.fiber = options.fiber ?? null
    this.routeFor = options.fiberRouteFor

    this.capabilities = {
      minting: this.strategy.canMint,
      deposits: true,
      withdrawals: true,
      selfCustody: true,
      externalWallets: true,
      fastPayments: this.fiber !== null,
      memos: false,
      instantSettlement: false,
      confirmationsRequired: this.network.confirmations,
    }
  }

  get asset(): Asset {
    return this.strategy.asset
  }

  /**
   * Whether an operation is backed by anything here.
   *
   * Minting is the strategy's to answer: this class always defines the hook,
   * but capacity has no issuer and a token has one only where the issuing key
   * is configured.
   *
   * @param operation
   * @returns
   */
  override supports(operation: LedgerOperation): boolean {
    if (operation === 'mint') return this.strategy.canMint

    return super.supports(operation)
  }

  async balance(ref: WalletRef): Promise<LedgerBalance> {
    const { total, pending } = await this.strategy.balanceOf(await this.readerFor(ref))

    return {
      asset: this.asset,
      total,
      pending,
      available: total.minus(pending),
      cursor: null,
    }
  }

  async transaction(ref: TransactionRef): Promise<LedgerTransaction | null> {
    return ref.reference.startsWith(FiberLedger.CHANNEL_PREFIX)
      ? this.channelTransaction(ref.reference)
      : this.chainTransaction(ref.reference)
  }

  /**
   * What this wallet's lock has taken part in, on the chain.
   *
   * The cursor is how far into that history the last page reached, because the
   * indexer is walked in order rather than queried by key. Channel payments
   * are not here: Fiber keeps them between the two nodes and the chain never
   * sees them, so they are looked up individually by their own reference.
   *
   * @param input
   * @returns
   */
  async listTransactions(input: ListTransactionsInput): Promise<TransactionPage> {
    const lock = await this.lockOf(input.wallet)
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
    const skip = this.offsetFrom(input.cursor)
    const transactions: LedgerTransaction[] = []
    let seen = 0

    for await (const found of this.chain.client.findTransactionsByLock(lock, undefined, true)) {
      seen += 1
      if (seen <= skip) continue

      const entry = await this.chainTransaction(found.txHash)
      if (!entry) continue
      if (input.since && entry.createdAt < input.since) continue

      transactions.push(entry)
      if (transactions.length >= limit) break
    }

    return {
      transactions,
      cursor: transactions.length < limit ? null : String(seen),
    }
  }

  /**
   * How far a cursor says the previous page reached.
   */
  private offsetFrom(cursor: string | null | undefined): number {
    const offset = Number(cursor ?? 0)

    return Number.isSafeInteger(offset) && offset > 0 ? offset : 0
  }

  async health(): Promise<LedgerHealth> {
    const chain = await this.chain.health()

    if (!this.fiber) return chain

    const fiber = await this.fiber.reachable()

    return { ...chain, detail: `${chain.detail ?? ''}; fiber ${fiber ? 'up' : 'down'}` }
  }

  /**
   * Stop using this ledger.
   *
   * The node is reached over a transport the ledger opened, and the public
   * ones are websockets, so a ledger that is never closed keeps a connection
   * open for the life of the process. Closing releases it and drops whatever
   * was resolved against the chain. Repeated calls are safe.
   */
  async close(): Promise<void> {
    this.strategy.forget?.()
    await this.chain.close()
  }

  protected async findWallet(ref: WalletRef): Promise<LedgerWallet | null> {
    try {
      await this.chain.parseAddress(ref.reference)
    } catch {
      return null
    }

    return {
      reference: ref.reference,
      address: ref.reference,
      custody: ref.secret ? 'embedded' : 'external',
      asset: this.asset,
      secret: ref.secret ?? null,
      status: 'active',
      createdAt: new Date(),
    }
  }

  protected async performCreateWallet(input: CreateWalletInput): Promise<LedgerWallet> {
    if (input.custody === 'external') return this.adoptAddress(input)

    const secret = this.keyring.create()
    const address = await this.keyring.addressOf(secret, this.chain.client)

    return {
      reference: address,
      address,
      custody: 'embedded',
      asset: this.asset,
      secret,
      status: 'active',
      createdAt: new Date(),
    }
  }

  /**
   * Attach a wallet the owner already controls.
   *
   * Nothing is generated and no key is held: the address is recorded so value
   * can be sent to it and its balance read. Spending from it stays with
   * whoever holds the key, which is the point of bringing your own wallet.
   *
   * @param input
   * @returns
   */
  private async adoptAddress(input: CreateWalletInput): Promise<LedgerWallet> {
    if (!input.address) {
      throw new MisconfiguredError('An external wallet needs the address it is attaching.')
    }

    const address = (await this.chain.parseAddress(input.address)).toString()

    return {
      reference: address,
      address,
      custody: 'external',
      asset: this.asset,
      secret: null,
      status: 'active',
      createdAt: new Date(),
    }
  }

  protected override async performImportWallet(input: ImportWalletInput): Promise<LedgerWallet> {
    const secret = this.keyring.adopt(input.secret.payload)
    const address = await this.keyring.addressOf(secret, this.chain.client)

    return {
      reference: address,
      address,
      custody: 'external',
      asset: this.asset,
      secret,
      status: 'active',
      createdAt: new Date(),
    }
  }

  /**
   * Hand the owner the key their wallet is controlled by.
   *
   * There is nothing to release that the application does not already hold, so
   * taking custody is a matter of the owner receiving the same material rather
   * than this ledger surrendering something it kept back.
   *
   * @param ref
   * @returns
   */
  protected override async performExportWallet(ref: WalletRef): Promise<WalletCustodyExport> {
    const secret = this.secretOf(ref)

    return {
      address: await this.keyring.addressOf(secret, this.chain.client),
      secret,
      mnemonic: null,
    }
  }

  protected override async performMint(input: MintInput): Promise<LedgerTransaction> {
    if (!this.strategy.buildMint) throw new UnsupportedOperationError('minting')

    const recipient = await this.lockOf(input.to)
    const issuer = this.issuer()
    const transaction = await this.strategy.buildMint(issuer, recipient, input.amount)
    const hash = await this.chain.submit(transaction, issuer)

    return this.record({
      reference: hash,
      kind: 'mint',
      rail: 'onchain',
      amount: input.amount,
      fee: this.amountOf(await transaction.getFee(this.chain.client)),
      from: null,
      to: input.to.reference,
      idempotencyKey: input.idempotencyKey,
    })
  }

  protected async performTransfer(input: TransferInput): Promise<LedgerTransaction> {
    const destination = 'address' in input.to ? input.to.address : input.to.reference
    const channel = input.preferFast ? await this.tryChannel(input, destination) : null

    return channel ?? this.settleOnChain(input, destination, 'transfer')
  }

  protected override async performWithdraw(input: WithdrawInput): Promise<LedgerTransaction> {
    return this.settleOnChain(
      { ...input, to: { address: input.destination } },
      input.destination,
      'withdrawal',
    )
  }

  /**
   * Somewhere value can arrive from outside.
   *
   * A CKB deposit is the wallet's own address: anything sent there is already
   * the wallet's, so there is nothing to credit afterwards and no intermediate
   * account to hold it.
   *
   * @param input
   * @returns
   */
  protected override async performDeposit(input: DepositInput): Promise<DepositIntent> {
    const address = (await this.walletOrFail(input.to)).address

    return {
      reference: `${address}:${input.idempotencyKey}`,
      address,
      memo: null,
      asset: this.asset,
      amount: input.amount ?? null,
      expiresAt: input.expiresAt ?? null,
      status: 'pending',
      uri: `ckb:${address}${input.amount ? `?amount=${input.amount.toUnits()}` : ''}`,
    }
  }

  protected override async findDeposit(reference: string): Promise<DepositIntent | null> {
    const address = reference.split(':')[0]
    if (!address) return null

    return {
      reference,
      address,
      memo: null,
      asset: this.asset,
      amount: null,
      expiresAt: null,
      status: 'pending',
      uri: `ckb:${address}`,
    }
  }

  /**
   * Build, sign and broadcast an ordinary chain transfer.
   *
   * @param input
   * @param destination
   * @param kind
   * @returns
   */
  private async settleOnChain(
    input: TransferInput,
    destination: string,
    kind: 'transfer' | 'withdrawal',
  ): Promise<LedgerTransaction> {
    const signer = this.signerFor(input.from)
    const sender = await signer.getRecommendedAddress()

    if (destination === sender) {
      throw new InvalidDestinationError('A wallet cannot pay itself.')
    }

    const lock = (await this.chain.parseAddress(destination)).script
    const transaction = await this.strategy.buildTransfer(signer, lock, input.amount)
    const hash = await this.chain.submit(transaction, signer)

    return this.record({
      reference: hash,
      kind,
      rail: 'onchain',
      amount: input.amount,
      fee: this.amountOf(await transaction.getFee(this.chain.client)),
      from: sender,
      to: destination,
      idempotencyKey: input.idempotencyKey,
    })
  }

  /**
   * Try the channel rail, and say nothing if it cannot carry the payment.
   *
   * Falling back to the chain is always correct, so anything short of a route
   * that is ready and funded returns null rather than failing the transfer.
   *
   * @param input
   * @param destination
   * @returns
   */
  private async tryChannel(
    input: TransferInput,
    destination: string,
  ): Promise<LedgerTransaction | null> {
    if (!this.fiber || !this.routeFor) return null

    const route = await this.routeFor(destination)
    if (!route) return null
    if (!(await this.fiber.canCarry(route, input.amount))) return null

    const payment = await this.fiber.pay(route, input.amount)
    const sender = await this.signerFor(input.from).getRecommendedAddress()

    return this.record({
      reference: `${FiberLedger.CHANNEL_PREFIX}${payment.payment_hash}`,
      kind: 'transfer',
      rail: 'channel',
      amount: input.amount,
      fee: this.amountOf(payment.fee ? BigInt(payment.fee) : 0n),
      from: sender,
      to: destination,
      idempotencyKey: input.idempotencyKey,
      externalTxId: payment.payment_hash,
      status: payment.status === 'Success' ? 'settled' : 'submitted',
    })
  }

  /**
   * One movement, as the chain records it.
   *
   * The amount is what reached the recipient rather than what the transaction
   * weighed: an ordinary transfer also carries change back to the sender, and
   * reporting the total would say a payment was larger than it was.
   *
   * @param hash
   * @returns
   */
  private async chainTransaction(hash: string): Promise<LedgerTransaction | null> {
    const facts = await this.chain.describe(hash)
    if (!facts) return null

    const { status, confirmations } = await this.chain.statusOf(hash)
    const occurredAt = facts.occurredAt ?? new Date()
    const amount =
      facts.recipientIndex === null
        ? this.amountOf(0n)
        : this.strategy.amountInOutput(facts.transaction, facts.recipientIndex)

    return {
      reference: hash,
      kind: 'transfer',
      status,
      rail: 'onchain',
      amount,
      fee: this.amountOf(facts.fee),
      from: facts.from,
      to: facts.to,
      idempotencyKey: '',
      externalTxId: hash,
      confirmations,
      memo: null,
      createdAt: occurredAt,
      settledAt: status === 'settled' ? occurredAt : null,
      failure:
        status === 'failed'
          ? { code: 'settlement_failed', message: facts.reason ?? 'The chain rejected it.' }
          : null,
    }
  }

  /**
   * One channel payment, as the Fiber node records it.
   *
   * There is no block to date it by and no counterparty address to report: a
   * payment travels to a node rather than to an address, and the route it took
   * is between the nodes on it.
   *
   * @param reference
   * @returns
   */
  private async channelTransaction(reference: string): Promise<LedgerTransaction | null> {
    if (!this.fiber) return null

    const hash = reference.slice(FiberLedger.CHANNEL_PREFIX.length)
    const { status, amount, fee, failure, sentAt } = await this.fiber.settlement(hash)

    if (status === 'unknown') return null

    const occurredAt = sentAt ?? new Date()

    return {
      reference,
      kind: 'transfer',
      status,
      rail: 'channel',
      amount: this.amountOf(amount),
      fee: this.amountOf(fee),
      from: null,
      to: null,
      idempotencyKey: '',
      externalTxId: hash,
      confirmations: null,
      memo: null,
      createdAt: occurredAt,
      settledAt: status === 'settled' ? occurredAt : null,
      failure: failure ? { code: 'settlement_failed', message: failure } : null,
    }
  }

  /**
   * Fill in what every movement this ledger writes has in common.
   * 
   * @param draft 
   * @returns 
   */
  private record(
    draft: Pick<
      LedgerTransaction,
      'reference' | 'kind' | 'rail' | 'amount' | 'fee' | 'from' | 'to' | 'idempotencyKey'
    > &
      Partial<Pick<LedgerTransaction, 'status' | 'externalTxId'>>,
  ): LedgerTransaction {
    return {
      ...draft,
      status: draft.status ?? 'submitted',
      externalTxId: draft.externalTxId ?? draft.reference,
      confirmations: 0,
      memo: null,
      createdAt: new Date(),
      settledAt: null,
      failure: null,
    }
  }

  /**
   * A signer that can spend, which needs the wallet's sealed material.
   * 
   * @param ref 
   * @returns 
   */
  private signerFor(ref: WalletRef): ccc.SignerCkbPrivateKey {
    return this.keyring.signer(this.secretOf(ref), this.chain.client)
  }

  /**
   * A signer that can only look, which needs nothing but the address.
   * 
   * @param ref 
   * @returns 
   */
  private async readerFor(ref: WalletRef): Promise<ccc.Signer> {
    if (ref.secret) return this.signerFor(ref)

    return new ccc.SignerCkbScriptReadonly(this.chain.client, await this.lockOf(ref))
  }

  /**
   * The lock a wallet reference names.
   *
   * A reference this ledger never issued is a wallet it does not have, not a
   * bad payment destination: the caller is asking about something of their own
   * rather than sending somewhere. An address that fails to parse when it is
   * the destination keeps its own reason.
   *
   * @param ref
   * @returns
   */
  private async lockOf(ref: WalletRef): Promise<ccc.Script> {
    try {
      return (await this.chain.parseAddress(ref.reference)).script
    } catch (error) {
      throw new WalletNotFoundError(ref.reference, error)
    }
  }

  private async walletOrFail(ref: WalletRef): Promise<LedgerWallet> {
    const wallet = await this.findWallet(ref)
    if (!wallet) throw new WalletNotFoundError(ref.reference)

    return wallet
  }

  private secretOf(ref: WalletRef) {
    if (!ref.secret) throw new WalletLockedError(ref.reference)

    return ref.secret
  }

  private issuer(): ccc.Signer {
    const strategy = this.strategy as CkbAssetStrategy & { minter?: () => ccc.Signer }

    if (!strategy.minter) {
      throw new MisconfiguredError('This asset has no issuer, so nothing can be minted.')
    }

    return strategy.minter()
  }

  private amountOf(minor: bigint): Amount {
    return Amount.of(minor, this.asset)
  }
}
