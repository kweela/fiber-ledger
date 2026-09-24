import { Amount, Asset } from '@kweela/ledger'
import { ccc } from '@ckb-ccc/core'
import { describe, expect, it } from 'vitest'

import {
  CkbChain,
  CkbNetwork,
  NativeCapacityAsset,
  UdtAsset,
  createFiberLedger,
} from '../src/index'

const testnet = () => new CkbNetwork({ name: 'testnet' })

/** One CKB, in shannons. */
const CKB = 100_000_000n

/**
 * A transaction with the given output capacities, as the chain would hold it.
 *
 * Capacities are whole CKB, because a cell cannot hold less than the bytes it
 * occupies and the SDK raises anything smaller to that floor.
 */
const withOutputs = (capacities: bigint[], data: string[] = []) =>
  ccc.Transaction.from({
    outputs: capacities.map((capacity) => ({
      lock: { codeHash: `0x${'11'.repeat(32)}`, hashType: 'type' as const, args: '0x' },
      capacity,
    })),
    outputsData: data,
  })

/**
 * Reading a movement back off the chain.
 *
 * A transaction says what it produced, not what was paid: an ordinary transfer
 * carries change back to the sender alongside the payment. Reporting the total
 * would tell the application a payment was larger than it was, which is the
 * difference these cases exist to hold.
 */
describe('what one output of a settled transaction carried', () => {
  const chain = new CkbChain(testnet())

  it('reads a capacity output as the capacity it holds', () => {
    const capacity = new NativeCapacityAsset(chain)
    const transaction = withOutputs([100n * CKB, 900n * CKB])

    expect(capacity.amountInOutput(transaction, 0).minor).toBe(100n * CKB)
    expect(capacity.amountInOutput(transaction, 1).minor).toBe(900n * CKB)
  })

  /** Asking about an output that is not there is not a reason to throw. */
  it('reads nothing from an output that does not exist', () => {
    const capacity = new NativeCapacityAsset(chain)

    expect(capacity.amountInOutput(withOutputs([100n * CKB]), 7).minor).toBe(0n)
  })

  it('reads a token output as the number written into its data', () => {
    const token = new UdtAsset(chain, {
      code: 'KWL',
      decimals: 8,
      ownerLockHash: `0x${'ab'.repeat(32)}`,
    })

    // 250 as a little-endian u128, which is how a UDT cell carries a balance.
    const amount = ccc.hexFrom(ccc.numLeToBytes(250n, 16))
    const transaction = ccc.Transaction.from({
      outputs: [
        {
          lock: { codeHash: `0x${'11'.repeat(32)}`, hashType: 'type' as const, args: '0x' },
          type: { codeHash: `0x${'22'.repeat(32)}`, hashType: 'type' as const, args: '0x' },
          capacity: 14_200_000_000n,
        },
      ],
      outputsData: [amount],
    })

    expect(token.amountInOutput(transaction, 0).minor).toBe(250n)
  })

  /**
   * Capacity is not the token.
   *
   * A cell with no type script holds plain CKB however much of it there is, so
   * counting its capacity as a token balance would invent value.
   */
  it('reads no token from a cell that is not carrying one', () => {
    const token = new UdtAsset(chain, {
      code: 'KWL',
      decimals: 8,
      ownerLockHash: `0x${'ab'.repeat(32)}`,
    })

    expect(token.amountInOutput(withOutputs([14_200_000_000n], ['0x']), 0).minor).toBe(0n)
  })
})

describe('closing a ledger', () => {
  const chain = new CkbChain(testnet())

  /** A reopened ledger must ask the chain again rather than trust a stale script. */
  it('drops what a token ledger had resolved against the chain', () => {
    const token = new UdtAsset(chain, {
      code: 'KWL',
      decimals: 8,
      ownerLockHash: `0x${'ab'.repeat(32)}`,
    })

    expect(() => token.forget()).not.toThrow()
    expect(() => token.forget()).not.toThrow()
  })

  it('leaves a capacity ledger with nothing to drop', () => {
    expect(new NativeCapacityAsset(chain).forget).toBe(undefined)
  })
})

describe('amounts a lookup reports', () => {
  it('keeps the asset the ledger denominates in', () => {
    const capacity = new NativeCapacityAsset(new CkbChain(testnet()))
    const read = capacity.amountInOutput(withOutputs([500n * CKB]), 0)

    expect(read.asset.equals(new Asset({ code: 'CKB', decimals: 8 }))).toBe(true)
    expect(read.equals(Amount.of(500n * CKB, capacity.asset))).toBe(true)
  })
})

/**
 * Telling a missing wallet from a bad destination.
 *
 * Asking about a reference this ledger never issued is a question about
 * something of the caller's own; sending to an address that will not parse is
 * a question about somewhere else. The shared conformance suite checks the
 * first of those by name, so the two cannot be collapsed into one reason.
 */
describe('references it does not recognise', () => {
  const ledger = createFiberLedger({ network: 'testnet' })

  it('reports a balance for an unknown wallet as a missing wallet', async () => {
    await expect(ledger.balance({ reference: 'not-a-wallet' })).rejects.toMatchObject({
      code: 'wallet_not_found',
    })
  })

  it('reports history for an unknown wallet the same way', async () => {
    await expect(
      ledger.listTransactions({ wallet: { reference: 'not-a-wallet' } }),
    ).rejects.toMatchObject({ code: 'wallet_not_found' })
  })

  it('reports a bad payment destination as a bad destination', async () => {
    const wallet = await ledger.createWallet({ ownerKey: 'a', idempotencyKey: 'unknown:1' })

    await expect(
      ledger.withdraw({
        from: wallet,
        destination: 'not-an-address',
        amount: Amount.of(100n * CKB, ledger.asset),
        idempotencyKey: 'unknown:2',
      }),
    ).rejects.toMatchObject({ code: 'invalid_destination' })
  })
})
