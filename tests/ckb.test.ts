import { ccc } from '@ckb-ccc/core'
import { Amount, LedgerError, MisconfiguredError } from '@kweela/ledger'
import { describe, expect, it } from 'vitest'

import {
  CkbChain,
  CkbKeyring,
  CkbNetwork,
  NativeCapacityAsset,
  UdtAsset,
  createFiberLedger,
} from '../src/index'

const testnet = () => new CkbNetwork({ name: 'testnet' })

describe('CkbNetwork', () => {
  it('knows which addresses belong to it', () => {
    expect(new CkbNetwork({ name: 'mainnet' }).addressPrefix).toBe('ckb')
    expect(testnet().addressPrefix).toBe('ckt')
  })

  it('waits longer on mainnet than on a test network', () => {
    expect(new CkbNetwork({ name: 'mainnet' }).confirmations).toBe(24)
    expect(testnet().confirmations).toBe(4)
    expect(new CkbNetwork({ name: 'testnet', confirmations: 1 }).confirmations).toBe(1)
  })

  it('refuses a devnet with nowhere to connect', () => {
    expect(() => new CkbNetwork({ name: 'devnet' })).toThrow(MisconfiguredError)
    expect(new CkbNetwork({ name: 'devnet', url: 'http://localhost:8114' }).name).toBe('devnet')
  })

  /**
   * A devnet deploys its own scripts, so the deployments the public client
   * ships with name cells that chain has never held. Addresses still derive,
   * because a code hash is a constant, which is what makes the mistake quiet
   * until the first transaction is submitted.
   */
  it('leaves a devnet on the public deployments when it is not told otherwise', async () => {
    const owner = new CkbNetwork({ name: 'devnet', url: 'http://localhost:8114' }).open()

    try {
      const devnet = await owner.value.getKnownScript(ccc.KnownScript.Secp256k1Blake160)
      const publicOwner = new CkbNetwork({ name: 'testnet' }).open()
      const testnetInfo = await publicOwner.value
        .getKnownScript(ccc.KnownScript.Secp256k1Blake160)
        .finally(() => publicOwner.dispose())

      expect(devnet.cellDeps[0]?.cellDep.outPoint.txHash).toBe(
        testnetInfo.cellDeps[0]?.cellDep.outPoint.txHash,
      )
    } finally {
      await owner.dispose()
    }
  })

  it('names a chain its own script deployments when it is given them', async () => {
    const txHash = `0x${'ab'.repeat(32)}`
    const owner = new CkbNetwork({
      name: 'devnet',
      url: 'http://localhost:8114',
      scripts: {
        [ccc.KnownScript.Secp256k1Blake160]: {
          codeHash: `0x${'cd'.repeat(32)}`,
          hashType: 'type',
          cellDeps: [{ cellDep: { outPoint: { txHash, index: 0 }, depType: 'depGroup' } }],
        },
      },
    }).open()

    try {
      const info = await owner.value.getKnownScript(ccc.KnownScript.Secp256k1Blake160)

      expect(info.codeHash).toBe(`0x${'cd'.repeat(32)}`)
      expect(info.cellDeps[0]?.cellDep.outPoint.txHash).toBe(txHash)
    } finally {
      await owner.dispose()
    }
  })

  /**
   * Fee calculation looks the DAO up on every transfer just to rule it out, so
   * a devnet map listing only what that chain deploys has to leave the rest of
   * the client's lookups answerable or nothing can be sent at all.
   */
  it('keeps the scripts a configured chain did not mention', async () => {
    const owner = new CkbNetwork({
      name: 'devnet',
      url: 'http://localhost:8114',
      scripts: {
        [ccc.KnownScript.Secp256k1Blake160]: {
          codeHash: `0x${'cd'.repeat(32)}`,
          hashType: 'type',
          cellDeps: [
            {
              cellDep: {
                outPoint: { txHash: `0x${'ab'.repeat(32)}`, index: 0 },
                depType: 'depGroup',
              },
            },
          ],
        },
      },
    }).open()

    try {
      await expect(owner.value.getKnownScript(ccc.KnownScript.NervosDao)).resolves.toBeDefined()
    } finally {
      await owner.dispose()
    }
  })

  /**
   * A cell pays for its own bytes, so the smallest transfer is an occupied
   * cell rather than one shannon.
   */
  it('counts capacity in shannons with a floor at an occupied cell', () => {
    expect(CkbNetwork.SHANNONS_PER_CKB).toBe(100_000_000n)
    expect(CkbNetwork.MIN_CELL_CAPACITY).toBe(6_100_000_000n)
    expect(CkbNetwork.MIN_UDT_CELL_CAPACITY).toBe(14_200_000_000n)
  })
})

describe('CkbKeyring', () => {
  const keyring = () => new CkbKeyring(testnet())

  it('seals a new key in the scheme the contract carries', () => {
    const secret = keyring().create()

    expect(secret.scheme).toBe(CkbKeyring.SCHEME)
    expect(secret.payload).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('never generates the same key twice', () => {
    const ring = keyring()
    const keys = new Set(Array.from({ length: 50 }, () => ring.create().payload))

    expect(keys.size).toBe(50)
  })

  it('accepts a key however it was written and normalizes it', () => {
    const ring = keyring()
    const raw = 'A'.repeat(64)

    expect(ring.adopt(raw).payload).toBe(`0x${'a'.repeat(64)}`)
    expect(ring.adopt(`0x${raw}`).payload).toBe(`0x${'a'.repeat(64)}`)
  })

  it('refuses material that is not a key', () => {
    const ring = keyring()

    expect(() => ring.adopt('not a key')).toThrow(MisconfiguredError)
    expect(() => ring.adopt('0x1234')).toThrow(MisconfiguredError)
    expect(() => ring.adopt(`0x${'0'.repeat(64)}`)).toThrow(/cannot be zero/)
  })

  it('refuses material sealed by something else', () => {
    const chain = new CkbChain(testnet())

    expect(() =>
      keyring().signer({ scheme: 'stellar-ed25519.v1', payload: '0x00' }, chain.client),
    ).toThrow(/ckb-secp256k1\.v1/)
  })

  /**
   * The same key must always mean the same address, or an application that
   * stored one and re-derived the other would be talking about two wallets.
   */
  it('derives one address from one key, every time', async () => {
    const chain = new CkbChain(testnet())
    const ring = keyring()
    const secret = ring.create()

    const first = await ring.addressOf(secret, chain.client)
    const second = await ring.addressOf(secret, chain.client)

    expect(second).toBe(first)
    expect(first.startsWith('ckt')).toBe(true)
  })
})

describe('translating CKB failures', () => {
  const chain = new CkbChain(testnet())

  it('reports a wallet that cannot cover a transaction as short of funds', () => {
    const failure = chain.translate(new ccc.ErrorTransactionInsufficientCapacity(1_000n))

    expect(failure.code).toBe('insufficient_funds')
  })

  it('keeps a contract failure as it already is', () => {
    const original = new MisconfiguredError('already ours')

    expect(chain.translate(original)).toBe(original)
  })

  it('reports anything it does not recognise as the node being unreachable', () => {
    const failure = chain.translate(new Error('socket hang up'))

    expect(failure.code).toBe('ledger_unavailable')
    expect(failure.retryable).toBe(true)
  })

  it('refuses an address from another network', async () => {
    await expect(chain.parseAddress('not-an-address')).rejects.toMatchObject({
      code: 'invalid_destination',
    })
  })
})

describe('what is being counted', () => {
  const chain = new CkbChain(testnet())

  it('cannot mint capacity, because bytes are not issued', () => {
    const capacity = new NativeCapacityAsset(chain)

    expect(capacity.canMint).toBe(false)
    expect(capacity.asset.code).toBe('CKB')
    expect(capacity.asset.decimals).toBe(8)
    expect(capacity.buildMint).toBe(undefined)
  })

  it('refuses a capacity transfer the chain would reject for being too small', async () => {
    const capacity = new NativeCapacityAsset(chain)
    const tiny = Amount.of(1n, capacity.asset)

    await expect(capacity.buildTransfer({} as never, {} as never, tiny)).rejects.toMatchObject({
      code: 'invalid_amount',
    })
  })

  it('can mint a token only when it holds the issuer key', () => {
    const options = {
      code: 'KWL',
      decimals: 8,
      ownerLockHash: `0x${'ab'.repeat(32)}`,
    }

    expect(new UdtAsset(chain, options).canMint).toBe(false)
    expect(new UdtAsset(chain, options, {} as never).canMint).toBe(true)
  })

  /** Two tokens with different owners are different tokens. */
  it('identifies a token by the lock that issues it', () => {
    const asset = new UdtAsset(chain, {
      code: 'KWL',
      decimals: 8,
      ownerLockHash: `0x${'AB'.repeat(32)}`,
    }).asset

    expect(asset.issuer).toBe(`0x${'ab'.repeat(32)}`)
    expect(asset.equals({ code: 'KWL', decimals: 8, issuer: `0x${'cd'.repeat(32)}` })).toBe(false)
  })

  it('refuses a token whose owner is not a lock hash', () => {
    expect(() => new UdtAsset(chain, { code: 'KWL', decimals: 8, ownerLockHash: '0x01' })).toThrow(
      MisconfiguredError,
    )
  })

  it('moves a token one minor unit at a time', () => {
    const token = new UdtAsset(chain, {
      code: 'KWL',
      decimals: 8,
      ownerLockHash: `0x${'ab'.repeat(32)}`,
    })

    expect(token.minimumTransfer).toBe(1n)
  })
})

describe('building the ledger from configuration', () => {
  it('denominates in CKB by default and cannot mint', () => {
    const ledger = createFiberLedger({ network: 'testnet' })

    expect(ledger.name).toBe('fiber')
    expect(ledger.asset.code).toBe('CKB')
    expect(ledger.capabilities.minting).toBe(false)
    expect(ledger.capabilities.fastPayments).toBe(false)
    expect(ledger.capabilities.confirmationsRequired).toBe(4)
  })

  it('offers the fast rail only where a Fiber node is configured', () => {
    const ledger = createFiberLedger({
      network: 'testnet',
      fiber: { url: 'http://localhost:8227', routeFor: () => null },
    })

    expect(ledger.capabilities.fastPayments).toBe(true)
  })

  it('mints a token when it is given the key that issues it', () => {
    const ledger = createFiberLedger({
      network: 'testnet',
      asset: { kind: 'token', code: 'KWL', decimals: 8, ownerLockHash: `0x${'ab'.repeat(32)}` },
      issuerKey: `0x${'11'.repeat(32)}`,
    })

    expect(ledger.asset.code).toBe('KWL')
    expect(ledger.capabilities.minting).toBe(true)
  })

  it('refuses an issuer key for an asset that has no issuer', () => {
    expect(() =>
      createFiberLedger({ network: 'testnet', issuerKey: `0x${'11'.repeat(32)}` }),
    ).toThrow(/no issuer/)
  })

  it('never claims a capability it cannot perform', async () => {
    const { LedgerCoherence } = await import('@kweela/ledger')

    expect(LedgerCoherence.check(createFiberLedger({ network: 'testnet' }))).toBe(true)
    expect(
      LedgerCoherence.check(
        createFiberLedger({
          network: 'testnet',
          asset: { kind: 'token', code: 'KWL', decimals: 8, ownerLockHash: `0x${'ab'.repeat(32)}` },
          issuerKey: `0x${'11'.repeat(32)}`,
        }),
      ),
    ).toBe(true)
  })
})

describe('acting for a wallet', () => {
  const ledger = createFiberLedger({ network: 'testnet' })

  /**
   * The application is the wallet's only custodian, so signing without the
   * sealed material is refused before anything reaches the chain.
   */
  it('refuses to spend from a wallet whose material it was not given', async () => {
    const wallet = await ledger.createWallet({ ownerKey: 'a', idempotencyKey: 'a' })

    await expect(
      ledger.transfer({
        from: { reference: wallet.reference },
        to: { address: wallet.address },
        amount: Amount.of(CkbNetwork.MIN_CELL_CAPACITY, ledger.asset),
        idempotencyKey: 't1',
      }),
    ).rejects.toMatchObject({ code: 'wallet_locked' })
  })

  it('names the wallet by the address it controls', async () => {
    const wallet = await ledger.createWallet({ ownerKey: 'a', idempotencyKey: 'create:1' })

    expect(wallet.reference).toBe(wallet.address)
    expect(wallet.address.startsWith('ckt')).toBe(true)
    expect(wallet.custody).toBe('embedded')
    expect(wallet.secret?.scheme).toBe(CkbKeyring.SCHEME)
  })

  it('creates one wallet for one key, however often it is asked', async () => {
    const first = await ledger.createWallet({ ownerKey: 'b', idempotencyKey: 'create:repeat' })
    const second = await ledger.createWallet({ ownerKey: 'b', idempotencyKey: 'create:repeat' })

    expect(second.reference).toBe(first.reference)
  })

  it('hands the owner the same key the application holds', async () => {
    const wallet = await ledger.createWallet({ ownerKey: 'c', idempotencyKey: 'create:2' })
    const exported = await ledger.exportWallet(wallet)

    expect(exported.address).toBe(wallet.address)
    expect(exported.secret.payload).toBe(wallet.secret?.payload)
  })

  it('attaches a wallet the owner already controls without holding its key', async () => {
    const theirs = await ledger.createWallet({ ownerKey: 'd', idempotencyKey: 'create:3' })
    const attached = await ledger.createWallet({
      ownerKey: 'e',
      idempotencyKey: 'attach:1',
      custody: 'external',
      address: theirs.address,
    })

    expect(attached.custody).toBe('external')
    expect(attached.secret).toBe(null)
  })

  it('refuses to attach something that is not an address', async () => {
    await expect(
      ledger.createWallet({
        ownerKey: 'f',
        idempotencyKey: 'attach:2',
        custody: 'external',
        address: 'ckt1nonsense',
      }),
    ).rejects.toMatchObject({ code: 'invalid_destination' })
  })

  it('offers a deposit at the wallet own address', async () => {
    const wallet = await ledger.createWallet({ ownerKey: 'g', idempotencyKey: 'create:4' })
    const intent = await ledger.deposit({
      to: wallet,
      amount: Amount.of(CkbNetwork.MIN_CELL_CAPACITY, ledger.asset),
      idempotencyKey: 'deposit:1',
    })

    expect(intent.address).toBe(wallet.address)
    expect(intent.uri?.startsWith('ckb:')).toBe(true)
    expect(intent.status).toBe('pending')
  })

  it('refuses an amount denominated in something else', async () => {
    const wallet = await ledger.createWallet({ ownerKey: 'h', idempotencyKey: 'create:5' })
    const failure = await ledger
      .transfer({
        from: wallet,
        to: { address: wallet.address },
        amount: Amount.of(1n, { code: 'XLM', decimals: 7 }),
        idempotencyKey: 'wrong-asset',
      })
      .catch((error) => error)

    expect(LedgerError.is(failure, 'asset_mismatch')).toBe(true)
  })
})

/**
 * The node connection a ledger opens.
 *
 * The public nodes are reached over a websocket, so a client is a resource
 * rather than a value: one that is never disposed keeps a connection open for
 * the life of the process, and the chain height has to be asked for through
 * that transport rather than over a fresh HTTP request.
 */
describe('owning the connection to the node', () => {
  it('hands the caller something it is responsible for disposing', async () => {
    const owner = testnet().open()

    expect(owner.isValid).toBe(true)
    expect(owner.value.addressPrefix).toBe('ckt')

    await owner.dispose()
    expect(owner.isValid).toBe(false)
  })

  it('points at the node it was configured with', async () => {
    const owner = new CkbNetwork({ name: 'devnet', url: 'http://127.0.0.1:8114' }).open()

    expect(owner.value.url).toBe('http://127.0.0.1:8114')
    await owner.dispose()
  })

  it('releases the connection when the chain closes, however often it is asked', async () => {
    const chain = new CkbChain(testnet())

    await expect(chain.close()).resolves.toBeUndefined()
    await expect(chain.close()).resolves.toBeUndefined()
  })

  it('releases it when the ledger closes', async () => {
    const ledger = createFiberLedger({ network: 'testnet' })

    await expect(ledger.close()).resolves.toBeUndefined()
    await expect(ledger.close()).resolves.toBeUndefined()
  })
})
