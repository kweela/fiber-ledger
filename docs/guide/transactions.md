# Transactions and history

## Looking one up

Transactions can be retrieved by reference.

```ts
const transaction = await ledger.transaction({
  reference,
})
```

The returned transaction describes the movement in application terms rather than exposing raw RPC
responses.

```ts
transaction.reference
transaction.amount // what reached the recipient
transaction.fee // what the movement paid to be carried
transaction.from // the sending address
transaction.to // the receiving address
transaction.rail // 'onchain' or 'channel'
transaction.status
transaction.confirmations
transaction.createdAt
transaction.settledAt
```

The exact chain or channel metadata required to maintain that state remains internal.

`null` is returned for a reference the ledger has no record of.

## Amount is the payment, not the transaction

A CKB transfer carries change back to the sender alongside the payment. `amount` is what reached the
recipient: the ledger resolves the transaction's inputs, identifies which output is not returning to
the sender, and reports that one.

A transaction that only pays its own sender has no such output and reports an amount of zero.

## Fees

`fee` is the difference between what the transaction consumed and what it produced, which is what
the chain charged to carry it. When the inputs cannot be resolved, the fee is reported as zero
rather than as a negative number.

## Timestamps

`createdAt` is the timestamp of the block carrying the transaction, which is the only time the chain
knows. A transaction that is not yet in a block reports the time it was looked up.

For channel payments, the time comes from the Fiber node's own record of the payment.

## Channel payments

A channel payment is looked up by its `fiber:<payment_hash>` reference and reports the amount and
fee the node recorded. It has no `from` or `to`: a payment travels to a node rather than to an
address, and the route it took is between the nodes on it.

## History

Wallet activity can be listed through the ledger API.

```ts
const page = await ledger.listTransactions({
  wallet: {
    reference: wallet.reference,
  },
  limit: 50,
})
```

The ledger translates the underlying CKB activity into the same transaction model.

```ts
page.transactions
page.cursor // null when there is nothing further
```

### Paging

Pass the previous page's cursor to continue.

```ts
let cursor: string | null = null

do {
  const page = await ledger.listTransactions({ wallet, limit: 50, cursor })
  handle(page.transactions)
  cursor = page.cursor
} while (cursor)
```

`limit` is clamped to between 1 and 200.

### Filtering

`since` drops transactions older than a given time, compared against the block timestamp.

```ts
await ledger.listTransactions({ wallet, since: startOfMonth })
```

::: warning Channel payments are not listed
History is read from the chain, so Fiber payments never appear in it. Applications that use the fast
rail should record channel references themselves and look them up individually.
:::
