# Health and shutdown

## Health

The ledger can report whether the services it depends on are reachable.

```ts
const health = await ledger.health()

health.reachable
health.blockHeight
health.detail
```

`reachable` reflects the CKB node: the ledger asks it for the chain tip, and reports the height it
returned. `detail` names the network and the node it asked.

When Fiber is configured, `detail` also reports whether the Fiber node answered.

```text
testnet at the public node; fiber up
```

A health check does not verify credentials, balances or channel liquidity. It answers whether the
ledger can talk to what it depends on.

This gives applications one place to determine whether the ledger is ready to accept operations.

## Shutdown

Use `close()` when the ledger is no longer needed.

```ts
await ledger.close()
```

This matters. The ledger opens a transport to the CKB node, and the public nodes are reached over a
websocket, so a ledger that is never closed keeps a connection open for the life of the process.

Closing releases that connection and drops whatever the ledger had resolved and cached against the
chain, such as a token's type script.

It is safe to call more than once.

A closed ledger should not be reused. Build another one if you need it again.
