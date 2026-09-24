# Deposits and withdrawals

## Deposits

A deposit represents value entering a wallet from outside the application's immediate transfer flow.

```ts
const intent = await ledger.deposit({
  to: wallet,
  amount,
  idempotencyKey: `deposit:${wallet.reference}`,
})
```

`amount` is optional and records what is expected; it does not constrain what arrives.

On CKB the deposit address is the wallet's own address, because anything sent there is already the
wallet's. The intent carries the address and a payment URI an external sender can use.

```ts
intent.address
intent.uri // 'ckb:ckb1...?amount=100'
intent.status // 'pending'
```

Nothing is credited by creating an intent. The application tracks the corresponding transaction
until the value has been detected and settled, which for native CKB means watching the balance or
the wallet's [history](./transactions).

::: warning Token mode
In token mode the deposit address is still the wallet's CKB address. Plain CKB sent there arrives
as capacity, not as the token. Funding a wallet with tokens means receiving a transfer of that
token.
:::

## Withdrawals

Withdrawals move value from an application-controlled wallet to an external destination.

```ts
const transaction = await ledger.withdraw({
  from: wallet,
  destination: address,
  amount,
  idempotencyKey: `withdrawal:${withdrawal.id}`,
})
```

`destination` is a plain address string rather than a wallet reference, because the value is
leaving. It is validated against the configured network before anything is built.

The ledger handles transaction creation, signing and submission using the same rules as other
outgoing movements, including the 61 CKB floor for native CKB and the requirement that `from`
carries its custody material.

A withdrawal always settles on chain. It does not take the Fiber rail.
