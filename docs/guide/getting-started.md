# Getting started

## Install

`@kweela/ledger` is a peer dependency and is required at runtime, so install both packages.

```sh
pnpm add @kweela/ledger @kweela/fiber-ledger
```

Node 20 or newer is required.

## Create a ledger

```ts
import { createFiberLedger } from '@kweela/fiber-ledger'

const ledger = createFiberLedger({
  network: 'testnet',
})
```

By default the ledger denominates in native CKB and talks to the public node for the chosen
network. Point it at your own node with `url`.

```ts
const ledger = createFiberLedger({
  network: 'mainnet',
  url: 'http://127.0.0.1:8114',
})
```

See [Configuration](/reference/configuration) for every option.

## Create a wallet

```ts
const wallet = await ledger.createWallet({
  ownerKey: user.id,
  idempotencyKey: `wallet:${user.id}`,
})
```

The wallet reference is its CKB address. The returned wallet also carries the custody material
needed to sign, which the application is responsible for storing securely.

```ts
await store.saveEncrypted(wallet.reference, wallet.secret)
```

## Read a balance

Read operations only need the reference.

```ts
const balance = await ledger.balance({
  reference: wallet.reference,
})

balance.total.toUnits() // '0'
```

## Send a payment

Operations that spend require the corresponding secret.

```ts
import { Amount } from '@kweela/ledger'

const transaction = await ledger.transfer({
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

A new wallet holds nothing, so this needs the wallet funded first. On a test network, fund the
address from a faucet.

## Wait for settlement

Submitting a CKB transaction does not immediately make it final.

```ts
const status = await ledger.settlement({
  reference: transaction.reference,
})
// 'submitted' until it reaches the configured confirmation depth, then 'settled'
```

See [Settlement](./settlement).

## Next

- [Running a node](./running-a-node) for devnet, testnet and mainnet setup
- [Asset modes](./asset-modes) for native CKB and application tokens
- [Wallets and custody](./wallets) for how keys are handled
- [Fiber](./fiber) for fast off-chain payments
- [Idempotency](./idempotency) before moving real value
