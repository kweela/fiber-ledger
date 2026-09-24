import { Amount, Asset, LedgerError } from '@kweela/ledger'
import { describe, expect, it } from 'vitest'

import {
  FiberClient,
  FiberPaymentRail,
  type FiberChannel,
  type FiberPayment,
  type FiberRoute,
} from '../src/index'

const CKB = new Asset({ code: 'CKB', decimals: 8 })
const ckb = (minor: bigint) => Amount.of(minor, CKB)

const PEER = '0xpeer'
const route: FiberRoute = { targetPubkey: PEER }

/** A Fiber node that answers however a case needs it to. */
class FakeFiberNode extends FiberClient {
  payments: FiberPayment[] = []

  constructor(
    private readonly channels: FiberChannel[] = [],
    private readonly outcome: Partial<FiberPayment> = {},
    private readonly down = false,
  ) {
    super('http://fiber.invalid')
  }

  override async listChannels(): Promise<FiberChannel[]> {
    if (this.down) throw new Error('unreachable')

    return this.channels
  }

  override async sendPayment(): Promise<FiberPayment> {
    if (this.down) throw new Error('unreachable')

    const payment: FiberPayment = {
      payment_hash: `0x${this.payments.length + 1}`,
      status: 'Success',
      fee: '0x0',
      ...this.outcome,
    }
    this.payments.push(payment)

    return payment
  }

  override async getPayment(hash: string): Promise<FiberPayment | null> {
    return this.payments.find((payment) => payment.payment_hash === hash) ?? null
  }
}

const channel = (over: Partial<FiberChannel> = {}): FiberChannel => ({
  channel_id: '0xchannel',
  peer_id: 'peer',
  remote_pubkey: PEER,
  state: { state_name: 'ChannelReady' },
  local_balance: '0x3e8',
  remote_balance: '0x0',
  ...over,
})

describe('deciding whether a channel can carry a payment', () => {
  it('carries an amount a ready channel has the near side for', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode([channel()]))

    expect(await rail.canCarry(route, ckb(1000n))).toBe(true)
  })

  it('declines an amount beyond what the near side holds', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode([channel()]))

    expect(await rail.canCarry(route, ckb(1001n))).toBe(false)
  })

  it('declines a channel that is not ready yet', async () => {
    const rail = new FiberPaymentRail(
      new FakeFiberNode([channel({ state: { state_name: 'AwaitingChannelReady' } })]),
    )

    expect(await rail.canCarry(route, ckb(1n))).toBe(false)
  })

  it('declines a channel to somebody else', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode([channel({ remote_pubkey: '0xother' })]))

    expect(await rail.canCarry(route, ckb(1n))).toBe(false)
  })

  it('declines a token channel for a CKB payment and the reverse', async () => {
    const tokenOnly = new FiberPaymentRail(
      new FakeFiberNode([channel({ udt_type_script: { code_hash: '0x1' } })]),
    )

    expect(await tokenOnly.canCarry(route, ckb(1n))).toBe(false)
    expect(
      await tokenOnly.canCarry({ ...route, udtTypeScript: { code_hash: '0x1' } }, ckb(1n)),
    ).toBe(true)
  })

  /**
   * Falling back to the chain is always correct, so a node that cannot be
   * asked is a no rather than a failure.
   */
  it('declines rather than failing when the node cannot be reached', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode([], {}, true))

    expect(await rail.canCarry(route, ckb(1n))).toBe(false)
  })
})

describe('paying over a channel', () => {
  it('reports a successful payment as settled, with no confirmations to wait for', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode([channel()], { fee: '0x5' }))
    const payment = await rail.pay(route, ckb(100n))

    const settlement = await rail.settlement(payment.payment_hash)
    expect(settlement.status).toBe('settled')
    expect(settlement.fee).toBe(5n)
  })

  it('reports a payment still finding its route as submitted', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode([channel()], { status: 'Inflight' }))
    const payment = await rail.pay(route, ckb(100n))

    expect((await rail.settlement(payment.payment_hash)).status).toBe('submitted')
  })

  it('fails the payment when the node says there was no route', async () => {
    const rail = new FiberPaymentRail(
      new FakeFiberNode([channel()], { status: 'Failed', failed_error: 'no path' }),
    )

    await expect(rail.pay(route, ckb(100n))).rejects.toMatchObject({
      code: 'settlement_failed',
    })
  })

  it('reports a payment it has never heard of as unknown', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode())

    expect((await rail.settlement('0xnothing')).status).toBe('unknown')
  })

  it('translates a node failure into the contract vocabulary', async () => {
    const rail = new FiberPaymentRail(new FakeFiberNode([], {}, true))
    const failure = await rail.pay(route, ckb(1n)).catch((error) => error)

    expect(LedgerError.is(failure, 'settlement_failed')).toBe(true)
  })
})
