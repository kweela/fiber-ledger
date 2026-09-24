# Idempotency

Every operation that can move or create value should use an idempotency key.

```ts
await ledger.transfer({
  from,
  to,
  amount,
  idempotencyKey: `payment:${payment.id}`,
})
```

This protects against a common failure case:

1. the application submits a payment
2. the payment succeeds
3. the response is lost
4. the application retries
5. the same payment is submitted again

When the same idempotency key is repeated, the ledger returns the result of the original operation
instead of executing it again.

A value-moving call with a blank key is refused with `misconfigured` rather than being submitted
unprotected.

## Which operations use it

`createWallet`, `importWallet`, `mint`, `transfer`, `deposit` and `withdraw` all take a key and are
protected by it. Keys are namespaced per ledger and per kind of operation, so the same string used
for a wallet and for a payment does not collide.

Read operations do not take one.

## Durability

The default store is in memory and is suitable for development and tests. It forgets everything
when the process restarts, which is exactly when a retry is most likely.

Production systems should provide durable storage.

```ts
const ledger = createFiberLedger({
  network: 'mainnet',

  idempotency: new SqlIdempotencyStore(db),
})
```

A store extends `IdempotencyStore` from `@kweela/ledger` and implements three methods.

```ts
import { IdempotencyStore } from '@kweela/ledger'

class SqlIdempotencyStore extends IdempotencyStore {
  async recall(key: string): Promise<string | null> {
    /* the handle this key produced, or null */
  }

  async remember(key: string, reference: string): Promise<void> {
    /* bind the key to the handle */
  }

  async forget(key: string): Promise<void> {
    /* drop the key */
  }
}
```

The backing store can use PostgreSQL, MySQL, Redis or another system capable of preserving the
required replay state.

## What it does not cover

A key protects one operation. It does not make two different operations atomic, and it does not
reverse anything: if a transfer settled and the application decides it should not have, the way
back is another transfer.
