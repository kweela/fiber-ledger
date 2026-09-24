# Types

The shapes an application works with. All of them come from `@kweela/ledger`.

## `Amount`

A quantity of one asset, counted in that asset's smallest unit. Immutable, and it refuses
arithmetic across two assets.

```ts
import { Amount } from '@kweela/ledger'

const sent = Amount.units('12.5', ledger.asset) // whole units
const fee = Amount.of(1000n, ledger.asset) // minor units

sent.plus(fee).toUnits() // '12.50001'
sent.minor // 1250000000n
sent.toJSON() // { minor: '1250000000', asset: { ... } }
```

Chain amounts overflow a JavaScript number, so `minor` is a `bigint` and anything crossing a wire or
a database column crosses as a decimal string.

## `Asset`

```ts
ledger.asset.code // 'CKB' or the token's code
ledger.asset.decimals // 8
ledger.asset.issuer // null for CKB, the owner lock hash for a token
```

## `LedgerWallet`

```ts
{
  reference: string // the CKB address
  address: string // the same string
  custody: 'embedded' | 'external'
  asset: Asset
  secret: LedgerSecret | null
  status: 'active' | 'provisioning' | 'unfunded' | 'closed'
  createdAt: Date
}
```

This package always reports `active`.

## `LedgerSecret`

```ts
{
  scheme: 'ckb-secp256k1.v1'
  payload: string // 32 bytes of hex
}
```

Store it encrypted. Pass it back on any operation that signs.

## `LedgerBalance`

```ts
{
  asset: Asset
  total: Amount
  pending: Amount // always zero here
  available: Amount // equal to total here
  cursor: string | null // always null here
}
```

## `LedgerTransaction`

```ts
{
  reference: string // 'fiber:<hash>' for a channel payment
  kind: 'mint' | 'transfer' | 'deposit' | 'withdrawal' | 'burn'
  status: SettlementStatus
  rail: 'onchain' | 'channel'
  amount: Amount // what reached the recipient
  fee: Amount
  from: string | null
  to: string | null
  idempotencyKey: string // empty on a looked-up transaction
  externalTxId: string | null
  confirmations: number | null // null for a channel payment
  memo: string | null // always null here
  createdAt: Date
  settledAt: Date | null
  failure: { code, message } | null
}
```

A looked-up transaction reports `kind: 'transfer'`, because the chain does not record what an
application meant by a movement.

## `DepositIntent`

```ts
{
  reference: string
  address: string
  memo: string | null // always null here
  asset: Asset
  amount: Amount | null
  expiresAt: Date | null
  status: SettlementStatus
  uri: string | null // 'ckb:<address>?amount=...'
}
```

## `SettlementStatus`

```ts
;'pending' | 'submitted' | 'settled' | 'failed' | 'expired' | 'unknown'
```

This package produces `submitted`, `settled`, `failed` and `unknown`.

## `LedgerCapabilities`

```ts
{
  minting: boolean
  deposits: boolean
  withdrawals: boolean
  selfCustody: boolean
  externalWallets: boolean
  fastPayments: boolean
  memos: boolean
  instantSettlement: boolean
  confirmationsRequired: number
}
```

See [Capabilities](/guide/capabilities).
