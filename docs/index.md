---
layout: home

hero:
  name: 'Fiber Ledger by Kweela'
  text: 'CKB and Fiber, as a ledger'
  image:
    src: /banner.jpg
    alt: Fiber Ledger Logo
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
    icon:
      src: /icons/api.svg
    details: Applications work with wallets, balances, amounts and transactions instead of cells, locks, scripts, signing, fees and RPC calls.
  - title: Native CKB or an application token
    icon:
      src: /icons/nervos.png
    details: The same operations cover native capacity and tokens stored on CKB through xUDT or sUDT type scripts.
  - title: Fiber where it helps
    icon:
      src: /icons/fiber.svg
    details: Fast off-chain payments when a route exists, an ordinary CKB transaction when one does not. The application performs one transfer either way.
  - title: Explicit custody
    icon:
      src: /icons/custody.svg
    details: Wallets the application controls are kept distinct from wallets controlled elsewhere, and signing always requires the custody material.
  - title: Safe retries
    icon:
      src: /icons/retry.svg
    details: Every value-moving operation takes an idempotency key, so a lost response does not become a second payment.
  - title: Stable errors
    icon:
      src: /icons/errors.svg
    details: CKB and Fiber failure conditions are translated into a fixed set of ledger errors before they reach the application.
---
