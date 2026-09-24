# Testing

## Package checks

Run the package test suite with:

```sh
pnpm test
```

Run all package checks with:

```sh
pnpm check
```

This covers linting, type checking, tests and the production build.

Unit tests do not require a running CKB or Fiber node. Fiber behaviour is covered against a stub
node, so route selection, liquidity checks and fallback are all exercised offline.

## Integration tests

Tests that interact with a real CKB environment require a configured node and funded test wallet.

```sh
FIBER_LEDGER_TEST_URL=http://127.0.0.1:8114 \
FIBER_LEDGER_TEST_FAUCET_KEY=0x... \
pnpm test
```

The faucet key funds the wallets each case creates, so it needs a balance on that network.

When the required environment is unavailable, integration tests report themselves as skipped rather
than silently passing.

## Ledger conformance

This package is also tested against the shared conformance suite from `@kweela/ledger`.

The suite verifies that behaviour exposed through the common ledger interface remains compatible
with other implementations: that a replayed key moves value once, an overdraft is refused, a settled
amount is the amount that was asked for, and a declared capability can actually be called.

It runs with the integration environment above, because every case moves real value. Minting is
skipped by name with its reason when the ledger is in native CKB mode, since capacity has no issuer.

This is useful for applications that depend on `@kweela/ledger`, but it is not required to use
`@kweela/fiber-ledger` directly.
