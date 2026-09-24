import { LedgerConformanceSuite } from '@kweela/ledger/conformance'
import { Amount, type Ledger } from '@kweela/ledger'
import { describe, expect, it } from 'vitest'

import { CkbKeyring, CkbNetwork, createFiberLedger, type FiberLedger } from '../src/index'

/**
 * The shared suite against a real CKB node.
 *
 * Every case here moves value on a chain, so it needs a node to talk to and a
 * key with something in it. Point `FIBER_LEDGER_TEST_URL` at a devnet and
 * `FIBER_LEDGER_TEST_FAUCET_KEY` at its genesis key and the suite runs in full;
 * without them there is nothing to run against and it is reported as skipped
 * rather than quietly passing.
 *
 * Running this against a funded testnet is recorded in LAUNCH_VERIFICATION.md,
 * because it needs infrastructure this repository cannot stand up on its own.
 */
const url = process.env.FIBER_LEDGER_TEST_URL
const faucetKey = process.env.FIBER_LEDGER_TEST_FAUCET_KEY

if (!url || !faucetKey) {
  describe('ledger contract conformance', () => {
    it.skip('needs FIBER_LEDGER_TEST_URL and FIBER_LEDGER_TEST_FAUCET_KEY to run against a node', () => {})
  })
} else {
  const network = new CkbNetwork({ name: 'devnet', url, confirmations: 1 })

  new LedgerConformanceSuite({
    ledger: () => createFiberLedger({ network: 'devnet', url, confirmations: 1 }),

    /** Pay a new wallet out of the genesis key so it has something to spend. */
    fund: async (ledger, wallet, amount) => {
      const faucet = await (ledger as FiberLedger).importWallet({
        ownerKey: 'faucet',
        idempotencyKey: `faucet:${Math.random()}`,
        secret: new CkbKeyring(network).adopt(faucetKey),
      })

      const tx = await ledger.transfer({
        from: faucet,
        to: { address: wallet.reference },
        amount,
        idempotencyKey: `faucet:${wallet.reference}:${amount.minor}`,
      })

      await waitForSettlement(ledger, tx.reference)
    },

    settle: async (ledger, tx) => {
      await waitForSettlement(ledger, tx.reference)

      return (await ledger.transaction({ reference: tx.reference }))!
    },

    /** Above the floor an occupied cell imposes, with room for a fee. */
    amount: Amount.units('100', { code: 'CKB', decimals: 8 }).minor,

    skip: {
      minting: 'CKB capacity has no issuer; value arrives by transfer',
    },
  }).run({ describe, it, expect: expect as never })
}

/** Wait until the chain says a movement is final, or give up saying so. */
async function waitForSettlement(ledger: Ledger, reference: string, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await ledger.settlement({ reference })

    if (status === 'settled') return
    if (status === 'failed' || status === 'expired') {
      throw new Error(`${reference} ended as ${status}.`)
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error(`${reference} did not settle within ${attempts} seconds.`)
}
