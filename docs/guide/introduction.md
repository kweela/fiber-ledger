# Introduction

`@kweela/fiber-ledger` is a utility for building wallets, balances, transfers, deposits and
withdrawals on Nervos CKB, with optional fast payments over Fiber.

It keeps CKB and Fiber implementation details inside the package so applications can work with a
compact ledger API instead of dealing directly with cells, locks, scripts, transaction
construction, signing, fees, RPC calls or payment channels.

## What it gives an application

A small set of operations that describe value rather than chains.

```ts
await ledger.createWallet({ ownerKey, idempotencyKey })
await ledger.balance({ reference })
await ledger.transfer({ from, to, amount, idempotencyKey })
await ledger.settlement({ reference })
```

The ledger resolves cells, builds and signs transactions, calculates fees, submits them and tracks
their state. The application works with wallets, balances, amounts and transactions.

## What it does not do

It is not a node, an indexer or a wallet application.

It talks to a CKB RPC node you point it at, and to a Fiber node if you configure one. It stores
nothing itself: wallets, custody material and transaction records are the application's to keep.

## Relationship to `@kweela/ledger`

`@kweela/fiber-ledger` implements the `Ledger` interface from
[`@kweela/ledger`](https://www.npmjs.com/package/@kweela/ledger) and depends on it at runtime, so
both packages are installed together.

Applications already built around that interface can use this package without introducing CKB or
Fiber concepts into the rest of their code. Applications that are not can call it directly and
ignore the interface entirely.

See [Using @kweela/ledger](./shared-interface).
