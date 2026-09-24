---
layout: home

hero:
  name: '@kweela/fiber-ledger'
  text: 'CKB and Fiber, as a ledger'
  tagline: Wallets, balances, transfers, deposits and withdrawals on Nervos CKB, with optional fast payments over Fiber.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Reference
      link: /reference/configuration

features:
  - title: A compact ledger API
    details: Applications work with wallets, balances, amounts and transactions instead of cells, locks, scripts, signing, fees and RPC calls.
  - title: Native CKB or an application token
    details: The same operations cover native capacity and tokens stored on CKB through xUDT or sUDT type scripts.
  - title: Fiber where it helps
    details: Fast off-chain payments when a route exists, an ordinary CKB transaction when one does not. The application performs one transfer either way.
  - title: Explicit custody
    details: Wallets the application controls are kept distinct from wallets controlled elsewhere, and signing always requires the custody material.
  - title: Safe retries
    details: Every value-moving operation takes an idempotency key, so a lost response does not become a second payment.
  - title: Stable errors
    details: CKB and Fiber failure conditions are translated into a fixed set of ledger errors before they reach the application.
---
