# React wallet connector

The optional `@kweela/fiber-ledger/react` entry point owns the CKB client and connector integration
for JoyID, Neuron, and compatible CCC wallets. Applications do not need to import a CKB SDK or
construct CKB transactions themselves.

Install the connector and React peers beside Fiber Ledger:

```sh
pnpm add @kweela/fiber-ledger @ckb-ccc/connector-react react
```

## Provider

Mount one provider around every control that connects or requests approval from a wallet. Keep it
mounted after the connection dialog closes so the selected signer remains available.

```tsx
import { FiberWalletProvider } from '@kweela/fiber-ledger/react'

export function WalletArea({ children }: { children: React.ReactNode }) {
  return (
    <FiberWalletProvider mainnet appName="My application">
      {children}
    </FiberWalletProvider>
  )
}
```

Set `mainnet={false}` for CKB testnet. Changing the network creates a fresh client and disposes the
previous client.

## Connect and disconnect

`useFiberWallet` exposes a provider-neutral connection. `open` shows the supported wallet chooser,
and `disconnect` closes the active connector session.

```tsx
import { useFiberWallet } from '@kweela/fiber-ledger/react'

function WalletControl() {
  const { connection, open, disconnect } = useFiberWallet()

  return connection ? (
    <button onClick={disconnect}>Disconnect {connection.walletName}</button>
  ) : (
    <button onClick={open}>Connect wallet</button>
  )
}
```

`connection.address` is the address that an application registers as an external wallet. Never
treat connection alone as proof that a payment occurred.

## Request a native CKB transfer

`approveCapacityTransfer` builds a native capacity transaction, asks the selected wallet to sign
it, submits it through that wallet, and resolves to the transaction hash.

```tsx
const { approveCapacityTransfer } = useFiberWallet()

const reference = await approveCapacityTransfer({
  exchangeId: exchange.id,
  destination: exchange.destination,
  amountMinor: exchange.amountMinor,
})

await api.verifyWalletTransfer(exchange.id, reference)
```

The amount is a CKB capacity value in shannons and stays a string until Fiber Ledger converts it to
`bigint`. The wallet also needs enough additional capacity for fees and a valid change cell.

This helper is for native CKB capacity. Token transfers need an asset-aware approval intent and are
not represented by this method.

The application server must look up the returned transaction and verify its sender, destination,
asset, amount, and uniqueness before granting coins, goods, or account credit. A transaction hash
from the browser is not proof of payment by itself.

## Events

Every wallet lifecycle event is dispatched on `window` as a `CustomEvent`. Import the stable names
instead of copying their string values.

```ts
import { FIBER_WALLET_EVENTS } from '@kweela/fiber-ledger/react'

window.addEventListener(FIBER_WALLET_EVENTS.approvalSucceeded, (event) => {
  // event.detail contains the approval intent and submitted transaction reference
})
```

| Export              | Event detail                         |
| ------------------- | ------------------------------------ |
| `connected`         | `{ address, walletName }`            |
| `disconnected`      | `null`                               |
| `approvalRequested` | The approval intent                  |
| `approvalSucceeded` | The approval intent plus `reference` |
| `approvalRejected`  | `{ approval, error }`                |

An approval rejection leaves the server-side exchange pending. It can be retried with the same
exchange rather than creating or crediting a second exchange.
