# Errors

CKB and Fiber expose many implementation-specific failure conditions. Those are translated into
stable ledger errors before reaching the application.

```ts
import { LedgerError } from '@kweela/ledger'

try {
  await ledger.transfer({
    from,
    to,
    amount,
    idempotencyKey,
  })
} catch (error) {
  if (LedgerError.is(error, 'insufficient_funds')) {
    // Handle the failure.
  }
}
```

Applications therefore do not need to depend directly on CKB RPC error formats or Fiber-specific
responses.

## Retrying

Errors carry whether the same call could reasonably succeed later.

```ts
if (LedgerError.is(error) && error.retryable) {
  // The node was unreachable or refusing; try again.
}
```

`ledger_unavailable` and `rate_limited` are retryable. Everything else describes a decision that
will not change on its own.

Retry with the same idempotency key. That is what makes it safe.

## What can fail

This includes failures related to:

- insufficient funds
- invalid amounts
- unavailable custody
- signing
- RPC connectivity
- transaction validation
- rejected transactions
- duplicate submissions
- fee requirements

See [Error codes](/reference/errors) for the full set and what produces each one.

## What is not an error

An unavailable Fiber route and insufficient channel liquidity are not failures. The transfer falls
back to the chain and succeeds. See [Fiber](./fiber).
