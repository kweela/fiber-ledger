# Error codes

Every failure reaches the application as a `LedgerError` from `@kweela/ledger`, carrying a code from
a fixed set.

```ts
import { LedgerError } from '@kweela/ledger'

if (LedgerError.is(error, 'insufficient_funds')) {
  // ...
}
```

## Codes this package produces

| Code                    | Retryable | What produces it                                                                                                                                                |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insufficient_funds`    | no        | The wallet cannot cover the amount plus the fee, or holds too little of the token                                                                               |
| `invalid_amount`        | no        | Zero or negative, or a native CKB transfer below 61 CKB                                                                                                         |
| `asset_mismatch`        | no        | An `Amount` of an asset this ledger does not settle in                                                                                                          |
| `invalid_destination`   | no        | Not an address, an address from another network, or a wallet paying itself                                                                                      |
| `wallet_locked`         | no        | An operation that signs was called without the custody material                                                                                                 |
| `wallet_not_found`      | no        | A reference the ledger cannot resolve to a wallet                                                                                                               |
| `unsupported_operation` | no        | An operation this configuration does not support, such as minting native CKB                                                                                    |
| `misconfigured`         | no        | A devnet with no URL, an issuer key on an unissued asset, unreadable key material, a blank idempotency key, or an issuer that does not control the token's lock |
| `settlement_failed`     | no        | The chain rejected the transaction, the fee was not accepted, the node already had it, or a channel payment failed                                              |
| `ledger_unavailable`    | **yes**   | The CKB or Fiber node could not be reached, or did not answer in time                                                                                           |
| `rate_limited`          | **yes**   | The node is refusing further calls for now                                                                                                                      |

## Codes the interface defines but this package does not raise

`wallet_unfunded` and `duplicate_idempotency_key` are part of `@kweela/ledger` and may be produced
by other implementations. Handle them if you write against the shared interface.

## Retrying

```ts
if (LedgerError.is(error) && error.retryable) {
  // The same call could reasonably succeed later.
}
```

Retry with the same idempotency key. See [Idempotency](/guide/idempotency).

## What is not an error

An unavailable Fiber route and insufficient channel liquidity are not failures: the transfer falls
back to the chain and succeeds. See [Fiber](/guide/fiber).
