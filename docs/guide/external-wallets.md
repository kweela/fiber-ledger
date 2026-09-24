# External wallets

Applications can register wallets whose private keys are managed elsewhere.

```ts
const wallet = await ledger.createWallet({
  custody: 'external',
  address,
  ownerKey: user.id,
  idempotencyKey: `wallet:${user.id}`,
})
```

No key is generated or stored by the ledger. The address is validated against the configured
network and recorded; `wallet.secret` is `null`.

## What they can do

External wallets can be used for operations that do not require local custody:

- reading balances
- receiving value
- acting as transfer destinations
- transaction lookup

Outgoing transactions remain the responsibility of whoever controls the external wallet.

## What they cannot do

Anything that signs. A transfer or withdrawal from an external wallet fails with `wallet_locked`,
because the ledger has no material to sign with and cannot obtain any.

## Addresses from another network

An address is checked against the configured network before it is accepted. Registering a mainnet
address on a testnet ledger fails with `invalid_destination` rather than being stored and failing
later.
