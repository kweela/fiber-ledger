# Balances

Balances are resolved from the cells controlled by a wallet.

```ts
const balance = await ledger.balance({
  reference: wallet.reference,
})
```

Reading a balance never needs custody material.

## What it contains

```ts
balance.total // everything the wallet holds
balance.pending // committed to movements that have not settled
balance.available // what can be spent now
balance.asset // what it is denominated in
```

Amounts are `Amount` values from `@kweela/ledger`, which carry their asset and count in minor
units.

```ts
balance.total.minor // 10000000000n
balance.total.toUnits() // '100'
```

## Native CKB

The balance is the capacity held by cells the wallet's lock controls.

Not all of it is spendable in practice: a cell must retain enough capacity to pay for its own bytes,
and a transfer must leave a valid change cell. A wallet holding exactly 61 CKB cannot send 61 CKB.

## Token mode

The balance is the amount of the configured token held by cells that carry its type script. Capacity
held by the same wallet is not counted, and a cell with no type script contributes nothing however
much capacity it holds.

Spending a token still requires capacity for the cells the transfer creates, so a wallet can hold a
token balance it cannot currently move.

## Pending

This package reports `pending` as zero and `available` equal to `total`. CKB has no mempool-level
notion of a reserved balance that can be read back per lock, so an unsettled outgoing transfer is
visible through its own transaction state rather than through the balance.

The application does not need to collect cells or interpret their contents directly.
