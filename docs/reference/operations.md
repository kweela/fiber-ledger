# Operations

Every operation a ledger built by `createFiberLedger` exposes.

## Wallets

### `createWallet(input)`

```ts
await ledger.createWallet({
  ownerKey: user.id,
  idempotencyKey: `wallet:${user.id}`,
  custody: 'embedded',
  address: undefined,
})
```

| Field            | Type                       | Meaning                                                    |
| ---------------- | -------------------------- | ---------------------------------------------------------- |
| `ownerKey`       | `string`                   | The application's identifier for the owner. Not a secret   |
| `idempotencyKey` | `string`                   | Makes the creation happen once                             |
| `custody`        | `'embedded' \| 'external'` | Whether the ledger generates a key. Defaults to `embedded` |
| `address`        | `string`                   | The address to register, for `external` custody            |

Returns a `LedgerWallet`. Embedded wallets carry `secret`; external ones carry `null`.

### `importWallet(input)`

```ts
await ledger.importWallet({ ownerKey, secret, idempotencyKey })
```

Validates the material, derives its address, and returns the wallet.

### `exportWallet(wallet)`

```ts
await ledger.exportWallet({ reference, secret })
```

Returns `{ address, secret, mnemonic: null }`. Requires the secret, because the ledger holds none.

### `balance(wallet)`

```ts
await ledger.balance({ reference })
```

Returns a `LedgerBalance`. Needs no secret.

## Moving value

### `transfer(input)`

```ts
await ledger.transfer({
  from: { reference, secret },
  to: { address } /* or { reference } */,
  amount,
  idempotencyKey,
  preferFast: false,
})
```

Returns the `LedgerTransaction` it submitted.

### `mint(input)`

```ts
await ledger.mint({ to: wallet, amount, idempotencyKey })
```

Token mode with an `issuerKey` only. Otherwise `unsupported_operation`.

### `deposit(input)`

```ts
await ledger.deposit({ to: wallet, amount, idempotencyKey, expiresAt })
```

Returns a `DepositIntent`. Credits nothing on its own.

### `withdraw(input)`

```ts
await ledger.withdraw({ from: wallet, destination, amount, idempotencyKey })
```

`destination` is an address string. Always settles on chain.

## Reading back

### `transaction(ref)`

```ts
await ledger.transaction({ reference })
```

Returns a `LedgerTransaction`, or `null` for a reference it has no record of.

### `settlement(ref)`

```ts
await ledger.settlement({ reference })
```

Returns a `SettlementStatus`.

### `listTransactions(input)`

```ts
await ledger.listTransactions({ wallet, limit, cursor, since })
```

Returns `{ transactions, cursor }`. On-chain activity only.

## Operating

### `health()`

```ts
await ledger.health()
```

Returns `{ reachable, blockHeight, detail }`.

### `close()`

```ts
await ledger.close()
```

Drops what the ledger cached against the chain. Safe to call repeatedly.

### `supports(operation)`

```ts
ledger.supports('mint')
```

Whether an operation is backed by anything under the current configuration.

## Properties

```ts
ledger.name // 'fiber'
ledger.label // 'Fiber Ledger'
ledger.asset // the Asset balances are denominated in
ledger.capabilities // what this configuration can do
```
