# Wallets and custody

A wallet represents a CKB address and the key material required to control it.

```ts
const wallet = await ledger.createWallet({
  ownerKey: user.id,
  idempotencyKey: `wallet:${user.id}`,
})
```

`ownerKey` is the application's own identifier for the owner. It is not a secret and is not used as
key material.

## The reference is the address

CKB has no account beyond the cells a lock owns, so there is nothing else durable to name a wallet
by. `wallet.reference` and `wallet.address` are the same string.

## Custody material

The returned wallet carries the custody material required for signing.

```ts
await store.saveEncrypted(wallet.reference, wallet.secret)
```

Applications are responsible for storing that material securely. The ledger keeps no copy: it holds
nothing between calls, and every operation that signs is handed what it needs.

Read operations only need the wallet reference.

```ts
const balance = await ledger.balance({
  reference: wallet.reference,
})
```

Operations that spend from an application-managed wallet require the corresponding secret.

```ts
await ledger.transfer({
  from: {
    reference: wallet.reference,
    secret: await store.openSecret(wallet.reference),
  },

  to: {
    address: recipient,
  },

  amount,
  idempotencyKey: `payment:${payment.id}`,
})
```

If signing is required and no usable custody material is provided, the operation fails with
`wallet_locked` before a transaction is submitted.

## Importing

Existing custody can be brought into the application.

```ts
const wallet = await ledger.importWallet({
  ownerKey: user.id,
  secret,
  idempotencyKey: `wallet:${user.id}`,
})
```

The material is validated before it is accepted, and the address is derived from it. An imported
wallet is otherwise treated the same way as one the ledger created.

## Exporting

```ts
const exported = await ledger.exportWallet({
  reference: wallet.reference,
  secret: await store.openSecret(wallet.reference),
})
```

Exporting does not create a new wallet and does not reveal anything the application was not already
holding. Because the ledger keeps no custody material, the secret has to be supplied, and what comes
back is that same material alongside the address it controls.

This is what transferring ownership looks like: the owner receives the key the application was
storing on their behalf. Calling it without the secret fails with `wallet_locked`.
