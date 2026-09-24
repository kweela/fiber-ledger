# Asset modes

`@kweela/fiber-ledger` can operate with native CKB or with an application token stored on CKB.

## Native CKB

By default, balances and transfers use native CKB.

```ts
const ledger = createFiberLedger({
  network: 'mainnet',
})
```

In this mode, wallet balances represent the CKB capacity held by cells controlled by the wallet.

Native CKB cannot be issued by the application, so minting is unavailable and
`capabilities.minting` is `false`.

Transfers must also satisfy CKB's cell capacity requirements. A cell has to pay for the bytes it
occupies, so the smallest ordinary transfer is 61 CKB. A smaller amount cannot produce a valid
output and is rejected with `invalid_amount` before submission.

Use this mode when the application needs to send, receive and hold CKB directly.

## Application tokens

The ledger can also operate with tokens represented by xUDT or sUDT type scripts.

```ts
const ledger = createFiberLedger({
  network: 'mainnet',

  asset: {
    kind: 'token',
    code: 'KWL',
    decimals: 8,
    ownerLockHash: '0x...',
  },

  issuerKey: process.env.ISSUER_KEY,
})
```

`standard` selects the type script and defaults to `xudt`. Set it to `sudt` for the older one.

The token balance lives in cell data while native CKB provides the capacity required to store it. A
cell carrying a token balance needs 142 CKB, which the sending wallet must hold in addition to the
token. This makes it possible to use CKB as the settlement layer for an application-specific asset.

Token transfers have no lower bound of their own: one minor unit can be moved, provided the wallet
holds the capacity to carry the cells.

### Issuing

If `issuerKey` is configured, the ledger can issue new tokens.

```ts
await ledger.mint({
  to: wallet,
  amount,
  idempotencyKey: `mint:${id}`,
})
```

The issuing key must control the lock named by `ownerLockHash`. If it does not, the mint is
refused with `misconfigured` rather than being submitted and rejected by the chain.

A node that only needs to hold or transfer existing tokens can omit the issuer key. Minting is then
reported as unavailable through `capabilities.minting`.

### Token identity

Token identity includes the owner lock hash that defines the asset. Two tokens that happen to share
the same display code are therefore still treated as separate assets if they come from different
issuers, and `Amount` refuses arithmetic across them.
