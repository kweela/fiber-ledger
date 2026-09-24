# Configuration

Everything is decided by the object passed to `createFiberLedger`.

```ts
import { createFiberLedger } from '@kweela/fiber-ledger'

const ledger = createFiberLedger({ network: 'mainnet' })
```

## `FiberLedgerConfig`

| Option          | Type                                 | Default                    | Meaning                                          |
| --------------- | ------------------------------------ | -------------------------- | ------------------------------------------------ |
| `network`       | `'mainnet' \| 'testnet' \| 'devnet'` | required                   | Which CKB to talk to                             |
| `url`           | `string`                             | the public node            | A node to talk to instead. Required for `devnet` |
| `confirmations` | `number`                             | 24 on mainnet, 4 otherwise | Depth at which a movement is settled             |
| `asset`         | see below                            | `{ kind: 'capacity' }`     | What balances are denominated in                 |
| `issuerKey`     | `string`                             | none                       | The key that authorises issuance, in token mode  |
| `fiber`         | see below                            | none                       | A Fiber node, for fast off-chain payments        |
| `idempotency`   | `IdempotencyStore`                   | in memory                  | Where replay protection is remembered            |

A `devnet` without a `url` is refused with `misconfigured`, as is an `issuerKey` on an asset that
has no issuer.

## `asset`

Native capacity, which is the default:

```ts
{
  kind: 'capacity'
}
```

Or a token stored on CKB:

```ts
{
  kind: 'token',
  code: 'KWL',
  decimals: 8,
  ownerLockHash: '0x...',
  standard: 'xudt',
  label: 'Kweela Coin',
}
```

| Field           | Type               | Default  | Meaning                                            |
| --------------- | ------------------ | -------- | -------------------------------------------------- |
| `code`          | `string`           | required | The display code the application shows             |
| `decimals`      | `number`           | required | How many minor units make one whole unit           |
| `ownerLockHash` | `string`           | required | The lock that authorises issuance, 32 bytes of hex |
| `standard`      | `'xudt' \| 'sudt'` | `'xudt'` | Which type script the token uses                   |
| `label`         | `string`           | none     | A display name                                     |

`ownerLockHash` is the token's identity. Two tokens with the same `code` and different owners are
different assets.

## `fiber`

```ts
{
  url: 'http://127.0.0.1:8227',
  timeoutMs: 15_000,
  routeFor: async (address) => ({ targetPubkey, maxFee: 1000n }),
}
```

| Field       | Type     | Default  | Meaning                                             |
| ----------- | -------- | -------- | --------------------------------------------------- |
| `url`       | `string` | required | The Fiber node's JSON-RPC endpoint                  |
| `timeoutMs` | `number` | `15000`  | How long to wait on that node                       |
| `routeFor`  | function | none     | Which node can be reached for a destination address |

Without `routeFor`, no destination resolves to a node and every transfer settles on chain.

### `FiberRoute`

```ts
{
  targetPubkey: '0x...',
  udtTypeScript: undefined,
  maxFee: 1000n,
}
```

| Field           | Type      | Meaning                                           |
| --------------- | --------- | ------------------------------------------------- |
| `targetPubkey`  | `string`  | The counterparty's Fiber node public key          |
| `udtTypeScript` | `unknown` | The token the channel carries, when it is not CKB |
| `maxFee`        | `bigint`  | The most this payment may pay in routing fees     |

## Environment

Nothing is read from the environment. Every value is passed in, so an application decides where its
own configuration comes from.

The two `FIBER_LEDGER_TEST_*` variables are read only by this package's own integration tests.
