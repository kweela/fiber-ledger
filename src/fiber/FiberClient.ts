import { JsonRpc } from '../JsonRpc'
import { LedgerUnavailableError } from '@kweela/ledger'

/**
 * A Fiber node, over its JSON-RPC interface.
 *
 * Fiber is CKB's payment-channel network. Two nodes that have locked capacity
 * into a channel can move value between them as often as they like without
 * touching the chain, and settle the net result to it when the channel closes.
 * That makes a payment immediate and nearly free, at the cost of needing a
 * channel to exist first.
 *
 * There is no published SDK, so this is the node's own RPC surface, typed and
 * kept in one place.
 */
export class FiberClient {
  private readonly rpc: JsonRpc

  constructor(url: string, timeoutMs = 15_000) {
    this.rpc = new JsonRpc(url, timeoutMs)
  }

  get url(): string {
    return this.rpc.url
  }

  async nodeInfo(): Promise<FiberNodeInfo> {
    return this.rpc.call<FiberNodeInfo>('node_info')
  }

  /** 
   * The channels this node holds, optionally with one peer. 
   * 
   * @param peerId 
   * @returns 
   */
  async listChannels(peerId?: string): Promise<FiberChannel[]> {
    const response = await this.rpc.call<{ channels: FiberChannel[] }>('list_channels', [
      peerId ? { peer_id: peerId } : {},
    ])

    return response.channels ?? []
  }

  /** 
   * Pay a node directly, without an invoice.
   * 
   * @param input 
   * @returns 
   */
  async sendPayment(input: FiberPaymentRequest): Promise<FiberPayment> {
    return this.rpc.call<FiberPayment>('send_payment', [
      {
        target_pubkey: input.targetPubkey,
        amount: hex(input.amount),
        keysend: true,
        allow_self_payment: false,
        ...(input.udtTypeScript ? { udt_type_script: input.udtTypeScript } : {}),
        ...(input.maxFee === undefined ? {} : { max_fee_amount: hex(input.maxFee) }),
      },
    ])
  }

  async getPayment(paymentHash: string): Promise<FiberPayment | null> {
    try {
      return await this.rpc.call<FiberPayment>('get_payment', [{ payment_hash: paymentHash }])
    } catch (error) {
      if (error instanceof LedgerUnavailableError && /not found/i.test(error.message)) return null

      throw error
    }
  }

  /**
   *  Whether the node is answering at all. 
   */
  async reachable(): Promise<boolean> {
    try {
      await this.nodeInfo()

      return true
    } catch {
      return false
    }
  }
}

export interface FiberNodeInfo {
  node_id: string
  node_name?: string | null
  addresses: string[]
  channel_count?: number
}

export type FiberChannelState =
  | 'NegotiatingFunding'
  | 'CollaboratingFundingTx'
  | 'SigningCommitment'
  | 'AwaitingTxSignatures'
  | 'AwaitingChannelReady'
  | 'ChannelReady'
  | 'ShuttingDown'
  | 'Closed'

export interface FiberChannel {
  channel_id: string
  peer_id: string
  /** The counterparty's node public key. */
  remote_pubkey?: string
  state: { state_name: FiberChannelState } | FiberChannelState
  /** Hexadecimal, in the channel asset's minor units. */
  local_balance: string
  remote_balance: string
  /** Present when the channel carries a token rather than CKB. */
  udt_type_script?: unknown
}

export interface FiberPaymentRequest {
  targetPubkey: string
  amount: bigint
  udtTypeScript?: unknown
  maxFee?: bigint
}

export type FiberPaymentStatus = 'Created' | 'Inflight' | 'Success' | 'Failed'

export interface FiberPayment {
  payment_hash: string
  status: FiberPaymentStatus
  /** Hexadecimal, in the channel asset's minor units. */
  amount?: string
  fee?: string
  failed_error?: string | null
  /** Milliseconds since the epoch, as the node reports it. */
  created_at?: string | number
}

function hex(value: bigint): string {
  return `0x${value.toString(16)}`
}
