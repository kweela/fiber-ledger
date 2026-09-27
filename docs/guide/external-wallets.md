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

Outgoing transactions remain the responsibility of whoever controls the external wallet. React
applications can ask the wallet to construct, approve, and submit a native CKB capacity transfer
through the [React wallet connector](./react-wallet-connector).

## What they cannot do

The server-side ledger cannot sign for an external wallet. Calling a transfer or withdrawal there
still fails with `wallet_locked`, because the server has no custody material. Signing must happen in
the wallet through the connector, and the application should verify the submitted transaction
before treating it as payment.

## Addresses from another network

An address is checked against the configured network before it is accepted. Registering a mainnet
address on a testnet ledger fails with `invalid_destination` rather than being stored and failing
later.
