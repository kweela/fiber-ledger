import { Amount, LedgerError, SettlementFailedError, type SettlementStatus } from '@kweela/ledger'

import { FiberClient, type FiberChannel, type FiberPayment } from './FiberClient'

/** What the node can say about a channel payment once it is looked up. */
export interface FiberSettlement {
  status: SettlementStatus
  amount: bigint
  fee: bigint
  failure: string | null
  sentAt: Date | null
}

export interface FiberRoute {
  /** The counterparty's Fiber node public key. */
  targetPubkey: string
  /** The token the channel carries, when it is not CKB. */
  udtTypeScript?: unknown
  /** The most this payment may pay in routing fees, in minor units. */
  maxFee?: bigint
}

/**
 * Paying over channels instead of over the chain.
 *
 * A Fiber payment is immediate and costs almost nothing, but only where a
 * route already exists with enough on the near side of it to cover the amount.
 * That makes the rail an optimisation and never an obligation: it is offered
 * when it can be honoured, and the caller falls back to the chain when it
 * cannot, rather than a transfer failing because a channel was missing.
 *
 * Nothing here decides whether a transfer should happen. That was settled
 * before the rail was asked.
 */
export class FiberPaymentRail {
  constructor(private readonly client: FiberClient) { }

  /**
   * Whether this amount could go over a channel to that node.
   *
   * A route is usable when a channel to the peer is ready and the local side
   * of it holds at least the amount. Any doubt is a no, because falling back
   * to the chain is always correct and a stuck payment is not.
   * 
   * @param route 
   * @param amount 
   * @returns 
   */
  async canCarry(route: FiberRoute, amount: Amount): Promise<boolean> {
    try {
      const channels = await this.client.listChannels()

      return channels.some((channel) => this.carries(channel, route, amount.minor))
    } catch {
      return false
    }
  }

  /** 
   * Send over a channel, or say plainly that it could not go that way. 
   * 
   * @param route 
   * @param amount 
   * @returns 
   */
  async pay(route: FiberRoute, amount: Amount): Promise<FiberPayment> {
    try {
      const payment = await this.client.sendPayment({
        targetPubkey: route.targetPubkey,
        amount: amount.minor,
        udtTypeScript: route.udtTypeScript,
        maxFee: route.maxFee,
      })

      if (payment.status === 'Failed') {
        throw new SettlementFailedError(
          `The channel payment failed: ${payment.failed_error ?? 'no route'}.`,
        )
      }

      return payment
    } catch (error) {
      if (LedgerError.is(error)) throw error

      throw new SettlementFailedError('The channel payment could not be sent.', error)
    }
  }

  /** 
   * How a channel payment stands, in the contract's own terms.
   * 
   * @param paymentHash 
   * @returns 
   */
  async settlement(paymentHash: string): Promise<FiberSettlement> {
    const payment = await this.client.getPayment(paymentHash)

    if (!payment) {
      return { status: 'unknown', amount: 0n, fee: 0n, failure: null, sentAt: null }
    }

    return {
      status: this.statusOf(payment),
      amount: payment.amount ? BigInt(payment.amount) : 0n,
      fee: payment.fee ? BigInt(payment.fee) : 0n,
      failure: payment.failed_error ?? null,
      sentAt: this.sentAt(payment),
    }
  }

  /**
   * When the node says the payment was made.
   *
   * A channel payment has no block to date it by, so the node's own record is
   * the only time there is. Null when it does not report one.
   * 
   * @param payment 
   * @returns 
   */
  private sentAt(payment: FiberPayment): Date | null {
    if (payment.created_at === undefined) return null

    const at = new Date(Number(payment.created_at))

    return Number.isNaN(at.getTime()) ? null : at
  }

  async reachable(): Promise<boolean> {
    return this.client.reachable()
  }

  /**
   * A channel payment is final when it succeeds.
   *
   * There is no confirmation count to wait for: the value has moved along the
   * route, and what remains is only the eventual settlement of the channel
   * itself, which is between the two nodes and not this payment.
   * 
   * @param payment 
   * @returns 
   */
  private statusOf(payment: FiberPayment): SettlementStatus {
    if (payment.status === 'Success') return 'settled'
    if (payment.status === 'Failed') return 'failed'

    return 'submitted'
  }

  private carries(channel: FiberChannel, route: FiberRoute, amount: bigint): boolean {
    if (this.stateOf(channel) !== 'ChannelReady') return false
    if (channel.remote_pubkey && channel.remote_pubkey !== route.targetPubkey) return false

    const carriesToken = Boolean(channel.udt_type_script)
    if (carriesToken !== Boolean(route.udtTypeScript)) return false

    return BigInt(channel.local_balance) >= amount
  }

  private stateOf(channel: FiberChannel): string {
    return typeof channel.state === 'string' ? channel.state : channel.state.state_name
  }
}
