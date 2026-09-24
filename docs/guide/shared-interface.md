# Using @kweela/ledger

`@kweela/fiber-ledger` implements the `Ledger` interface from
[`@kweela/ledger`](https://www.npmjs.com/package/@kweela/ledger).

That means applications already built around that interface can use `@kweela/fiber-ledger` without
introducing CKB or Fiber concepts into the rest of their code.

```ts
import { LedgerRegistry } from '@kweela/ledger'
import { createFiberLedger } from '@kweela/fiber-ledger'

LedgerRegistry.shared.register('fiber', () =>
  createFiberLedger({
    network: 'mainnet',
  }),
)

const ledger = await LedgerRegistry.shared.resolve('fiber')
```

The registry holds factories rather than instances, so registering a ledger does not open
connections or unseal keys.

## Installing it through a host

A host application that discovers ledgers from configuration can use the descriptor this package
exports.

```ts
import { ledgerPlugin } from '@kweela/fiber-ledger'

ledgerPlugin.name // 'fiber'
ledgerPlugin.create(settings) // a configured ledger
```

The descriptor names itself, so the configuration key does not have to be derived from the package
name and renaming the package does not change what configuration selects.

## Is the interface optional?

The API surface is. `@kweela/fiber-ledger` can be called directly, and nothing requires an
application to write its own code against `Ledger`, `LedgerRegistry` or the conformance suite.

The package is not. `@kweela/ledger` is a peer dependency and is imported at runtime: the ledger
extends its base class and every error it raises is one of its classes. Both packages are installed
together.
