# Settlement

Submitting an on-chain CKB transaction does not immediately make it final.

```ts
const status = await ledger.settlement({
  reference: transaction.reference,
})
```

## On-chain

On-chain transactions remain pending until they reach the configured confirmation requirement.

```text
submitted
```

may indicate that the transaction exists in the pool, or that it has been committed but has not yet
reached sufficient confirmation depth.

Once the configured requirement is satisfied:

```text
settled
```

is returned.

Confirmation requirements can be configured according to the environment and application's risk
tolerance. The defaults are 24 blocks on mainnet and 4 on a test network.

```ts
createFiberLedger({ network: 'mainnet', confirmations: 12 })
```

## Fiber

Fiber payments have different settlement behaviour. A successfully completed channel payment can be
treated as settled immediately from the application's point of view, and reports no confirmation
count because there is no block to count against.

## Every state

| Status      | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| `submitted` | In the pool, or committed but not yet deep enough        |
| `settled`   | Final, as far as the configured requirement is concerned |
| `failed`    | Rejected by the chain, or the channel payment failed     |
| `unknown`   | The ledger has no record of this reference               |

`pending` and `expired` are part of the shared interface but are not produced by this package.

The ledger normalises both rails behind the same settlement API.
