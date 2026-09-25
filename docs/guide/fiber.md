# Fiber

Fiber adds fast off-chain payments using CKB payment channels.

When a suitable route exists between Fiber nodes, value can move without creating a new on-chain
CKB transaction for every payment.

Fiber support is optional. Without it, `capabilities.fastPayments` is `false` and every transfer
settles on chain.

## When it earns its keep

Fiber pays a **node**, not an address. `routeFor` has to resolve the destination to some other Fiber
node's public key, and if it cannot, the transfer settles on chain.

That makes the useful question not "is Fiber configured" but "is there a second node on the other
end of this payment".

| Paying                                             | Second node | Rail     |
| -------------------------------------------------- | ----------- | -------- |
| Between two wallets your own application custodies | No          | On chain |
| To someone running their own Fiber node            | Yes         | Channel  |
| To a service or exchange that accepts Fiber        | Yes         | Channel  |
| Out to an ordinary CKB address                     | No          | On chain |

The first row is worth dwelling on. If your application holds the keys for both sides of a transfer,
both wallets sit behind the same Fiber node, there is nobody to route to, and every such payment
settles on chain however Fiber is configured.

**Fiber does not make transfers between your own users cheaper.** It earns its keep when value
leaves your application to a counterparty who runs their own node.

If that is not your situation yet, leave `fiber` unset. `capabilities.fastPayments` reports `false`,
nothing else changes, and you can add it the day it becomes worth having.

## Configuring it

```ts
const ledger = createFiberLedger({
  network: 'mainnet',

  fiber: {
    url: 'http://127.0.0.1:8227',

    routeFor: async (address) => {
      const node = await directory.fiberNodeFor(address)

      if (!node) {
        return null
      }

      return {
        targetPubkey: node.pubkey,
        maxFee: 1000n,
      }
    },
  },
})
```

`routeFor` connects a destination address with the Fiber node that can receive the payment.

How that mapping is discovered is left to the application. It could come from a local directory,
account metadata, another service, application configuration or a discovery protocol. The ledger
only needs the information required to attempt the payment.

Without `routeFor`, no destination ever resolves to a node and every transfer settles on chain.

## Fast payments

A transfer can prefer Fiber when available.

```ts
const transaction = await ledger.transfer({
  from,
  to,
  amount,
  preferFast: true,
  idempotencyKey: `payment:${payment.id}`,
})
```

The ledger asks `routeFor` for a route, then checks the node for a channel that is ready, points at
that peer, carries the right asset and holds at least the amount on the near side. If all of that
holds, the payment goes over the channel.

Fiber transactions identify the rail used:

```ts
transaction.rail
// 'channel'
```

and use a Fiber-specific reference:

```text
fiber:<payment_hash>
```

A successful Fiber payment is considered settled from the application's point of view. The eventual
lifecycle and on-chain settlement of the underlying payment channels remain internal to the Fiber
network and participating nodes.

## Fallback

Fast payment is a preference, not a requirement.

If Fiber is not configured, the node cannot be reached, no suitable route exists, or the route
cannot carry the requested amount, the ledger falls back to an ordinary CKB transaction.

```ts
await ledger.transfer({
  from,
  to,
  amount,
  preferFast: true,
  idempotencyKey,
})
```

The application still performs one transfer operation. The ledger decides which rail can satisfy it.

This allows Fiber to improve payment speed without making application functionality depend on
channel availability.

One case does not fall back: a payment the node accepts and then reports as failed. The ledger
cannot know whether value moved, so it raises `settlement_failed` rather than retrying on chain and
risking a double payment.

## History

Channel payments do not appear in [`listTransactions`](./transactions). Fiber keeps them between the
two nodes and the chain never sees them, so they are looked up individually by their own reference.
