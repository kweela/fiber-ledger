# Transfers

Transfers use the same application-facing operation regardless of whether they eventually move over
CKB or Fiber.

```ts
const transaction = await ledger.transfer({
  from,
  to,
  amount,
  idempotencyKey: `payment:${payment.id}`,
})
```

`from` is a wallet reference with its secret. `to` is either another wallet reference or a plain
`{ address }`.

## What the ledger does

For on-chain transfers, that includes:

- finding suitable input cells
- calculating required capacity
- creating outputs
- applying type scripts
- calculating transaction fees
- signing
- submitting the transaction
- tracking its state

These concerns stay inside the package.

## What is checked first

Before anything is built or submitted:

- the amount must be positive and denominated in the ledger's own asset, or `invalid_amount` and
  `asset_mismatch` respectively
- a wallet cannot pay itself, or `invalid_destination`
- the destination must be a valid address on the configured network
- native CKB transfers must be at least 61 CKB, so the output can pay for its own bytes
- signing material must be present, or `wallet_locked`

## Memos

CKB transfers carry no memo. A `memo` passed to `transfer` is dropped rather than failing the
transfer, and `capabilities.memos` reports `false`.

## The returned transaction

`transfer` returns the movement as the ledger recorded it, including the amount, the fee it paid,
the rail it took and the reference to look it up by.

```ts
transaction.reference
transaction.rail // 'onchain' or 'channel'
transaction.fee.toUnits()
transaction.status // 'submitted'
```

A freshly submitted transfer is never `settled`. See [Settlement](./settlement).
