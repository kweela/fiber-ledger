# What stays inside

The purpose of the package is to give applications useful CKB and Fiber operations without requiring
them to implement the underlying infrastructure themselves.

It owns concerns such as:

- CKB addresses
- secp256k1 keys
- wallet generation
- signing
- cells
- cell collection
- capacity
- lock scripts
- type scripts
- xUDT and sUDT handling
- transaction construction
- transaction fees
- RPC communication
- submission
- confirmation tracking
- token issuance
- Fiber RPC
- route handling
- payment channels
- channel liquidity
- Fiber payment references
- provider-specific error translation

Applications work with wallets, balances, amounts and transactions instead.

## What stays outside

The package is deliberately not responsible for:

- **Storage.** Wallets, custody material and transaction records are the application's to keep. The
  ledger holds nothing between calls.
- **Key security.** Custody material is handed back once and passed in on every signing call.
  Encrypting it at rest is the application's job.
- **Running nodes.** It talks to a CKB node and optionally a Fiber node; it does not operate them.
- **Opening channels.** Fiber channels are opened and funded outside this package. It uses the
  routes that already exist.
- **Deciding policy.** Who may send what to whom, and whether a payment should happen, is the
  application's question.
- **Reconciliation.** Comparing the chain against an application's own records is an application
  concern, though everything needed to do it is exposed.

## Design goals

### Keep CKB usable from application code

Applications should work with understandable concepts such as wallets, balances and transfers rather
than reconstructing CKB transactions themselves.

### Keep Fiber optional

Fiber should improve payments where it is available without becoming a requirement for moving value.

### Support both native and application assets

The same utility should work for native CKB and tokens built on CKB.

### Keep custody explicit

The package should distinguish clearly between wallets controlled by the application and wallets
controlled elsewhere.

### Make retries safe

Value-moving operations should be safe to retry when network failures make the result uncertain.

### Hide infrastructure, not behaviour

Applications should still be able to inspect balances, transaction state, fees, settlement and
capabilities without depending on low-level provider internals.
