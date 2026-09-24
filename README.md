# @kweela/fiber-ledger

A utility for building wallets, balances, transfers, deposits and withdrawals on Nervos CKB, with optional fast payments over Fiber.

It keeps CKB and Fiber implementation details inside the package so applications can work with a compact ledger API instead of dealing directly with cells, locks, scripts, transaction construction, signing, fees, RPC calls or payment channels.

It implements the [`@kweela/ledger`](https://www.npmjs.com/package/@kweela/ledger) interface, which it also depends on at runtime.

📖 **[Documentation](https://kweela.github.io/kweela-fiber-ledger/)**

## Install

```sh
pnpm add @kweela/ledger @kweela/fiber-ledger
```

Node 20 or newer is required.

## Basic usage

```ts
import { createFiberLedger } from '@kweela/fiber-ledger'
import { Amount } from '@kweela/ledger'

const ledger = createFiberLedger({
  network: 'mainnet',

  fiber: {
    url: process.env.FIBER_RPC_URL,
    routeFor: lookUpFiberNode,
  },
})
```

Create a wallet. Its reference is its CKB address, and the custody material it returns is the application's to store.

```ts
const wallet = await ledger.createWallet({
  ownerKey: user.id,
  idempotencyKey: `wallet:${user.id}`,
})

await store.saveEncrypted(wallet.reference, wallet.secret)
```

Read operations only need the reference.

```ts
const balance = await ledger.balance({
  reference: wallet.reference,
})
```

Operations that spend require the corresponding secret.

```ts
await ledger.transfer({
  from: {
    reference: wallet.reference,
    secret: await store.openSecret(wallet.reference),
  },

  to: {
    address: recipient,
  },

  amount: Amount.units('100', ledger.asset),

  idempotencyKey: `payment:${payment.id}`,
})
```

Submitting a CKB transaction does not immediately make it final.

```ts
const status = await ledger.settlement({
  reference: transaction.reference,
})
// 'submitted' until it reaches the configured confirmation depth, then 'settled'
```

The ledger handles the CKB and Fiber-specific work internally and exposes a small set of operations for the application.

## What else it does

- [Asset modes](https://kweela.github.io/kweela-fiber-ledger/guide/asset-modes) — native CKB, or a token stored on CKB through xUDT or sUDT
- [Wallets and custody](https://kweela.github.io/kweela-fiber-ledger/guide/wallets) — creating, importing, exporting, and wallets controlled elsewhere
- [Fiber](https://kweela.github.io/kweela-fiber-ledger/guide/fiber) — fast off-chain payments, and falling back to the chain when no route exists
- [Idempotency](https://kweela.github.io/kweela-fiber-ledger/guide/idempotency) — making retries safe before moving real value
- [Errors](https://kweela.github.io/kweela-fiber-ledger/reference/errors) — the fixed set of failures CKB and Fiber conditions are translated into

## Development

```sh
pnpm test     # unit tests; no CKB or Fiber node required
pnpm check    # lint, type check, tests and the production build
pnpm docs:dev # the documentation site
```

Tests that interact with a real CKB environment require a configured node and funded test wallet.

```sh
FIBER_LEDGER_TEST_URL=http://127.0.0.1:8114 \
FIBER_LEDGER_TEST_FAUCET_KEY=0x... \
pnpm test
```

When the required environment is unavailable, they report themselves as skipped rather than silently passing.

## License

MIT
