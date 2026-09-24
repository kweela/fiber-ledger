# Capabilities

A ledger instance exposes the functionality available under its current configuration.

```ts
ledger.capabilities
```

Not every configuration supports every operation, so applications should read these rather than
assume.

```ts
ledger.capabilities.minting
ledger.capabilities.deposits
ledger.capabilities.withdrawals
ledger.capabilities.selfCustody
ledger.capabilities.externalWallets
ledger.capabilities.fastPayments
```

## What decides each one

| Capability              | This package                                     |
| ----------------------- | ------------------------------------------------ |
| `minting`               | Only in token mode with an `issuerKey`           |
| `deposits`              | Always                                           |
| `withdrawals`           | Always                                           |
| `selfCustody`           | Always                                           |
| `externalWallets`       | Always                                           |
| `fastPayments`          | Only when `fiber` is configured                  |
| `memos`                 | Never: CKB transfers carry no memo               |
| `instantSettlement`     | Never: on-chain movements wait for confirmations |
| `confirmationsRequired` | The configured depth, or the network default     |

For example:

- native CKB does not support minting
- token mode supports minting when an issuer key is configured
- fast payments require Fiber configuration
- application-managed wallets support signing
- external wallets do not expose their private keys

## Using them

Applications should use these capabilities when deciding which operations to expose.

```ts
if (ledger.capabilities.fastPayments) {
  // Offer an instant option.
}
```

Calling an operation the ledger does not support fails with `unsupported_operation` rather than
doing something unexpected.
