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
| `scripts`       | see below                            | the public deployments     | Where this chain's scripts live. For `devnet`    |
| `asset`         | see below                            | `{ kind: 'capacity' }`     | What balances are denominated in                 |
| `issuerKey`     | `string`                             | none                       | The key that authorises issuance, in token mode  |
| `fiber`         | see below                            | none                       | A Fiber node, for fast off-chain payments        |
| `idempotency`   | `IdempotencyStore`                   | in memory                  | Where replay protection is remembered            |

A `devnet` without a `url` is refused with `misconfigured`, as is an `issuerKey` on an asset that
has no issuer.

## `scripts`

A script is code living in a cell, and spending a cell means naming the cell that code sits in.
Those locations are fixed per network, so the public ones ship with the client and mainnet and
testnet need nothing here.

A devnet is different. It starts from an empty chain and deploys its own, so the public locations
name cells it has never held. Nothing looks wrong until the first transfer: addresses still derive,
because a code hash is a constant, and balances still read. Only submission fails.

```ts
createFiberLedger({
  network: 'devnet',
  url: 'http://127.0.0.1:8114',
  scripts: {
    Secp256k1Blake160: {
      codeHash: '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8',
      hashType: 'type',
      cellDeps: [{ cellDep: { outPoint: { txHash: '0x...', index: 0 }, depType: 'depGroup' } }],
    },
  },
})
```

Keys are CCC's `KnownScript` names. What you give is layered over the public deployments rather
than replacing them, so a map naming only what your chain deploys is enough: the client still has
an answer for the scripts it merely compares against, which it does on every transfer.

[offckb](https://github.com/ckb-devrel/offckb) prints its devnet's deployment in this shape:

```sh
offckb system-scripts --network devnet --export-style ccc | tail -n +3 > devnet-scripts.json
```

[`health()`](/guide/health) checks the configured lock deployment against the chain and says so
when the cell is not there, which is the quickest way to catch this.

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
