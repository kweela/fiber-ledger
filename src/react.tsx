import { ccc } from '@ckb-ccc/connector-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export const FIBER_WALLET_EVENTS = {
  connected: 'fiber-wallet-connected',
  disconnected: 'fiber-wallet-disconnected',
  approvalRequested: 'fiber-wallet-approval-requested',
  approvalSucceeded: 'fiber-wallet-approval-succeeded',
  approvalRejected: 'fiber-wallet-approval-rejected',
} as const

export interface FiberWalletConnection {
  address: string
  walletName: string
}

export interface FiberTransferApproval {
  exchangeId: string
  destination: string
  amountMinor: string
}

interface FiberWalletContextValue {
  connection: FiberWalletConnection | null
  open: () => void
  disconnect: () => void
  approveCapacityTransfer: (approval: FiberTransferApproval) => Promise<string>
}

const FiberWalletContext = createContext<FiberWalletContextValue | null>(null)

function emit(name: string, detail: unknown): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail }))
}

function FiberWalletSession({ children }: { children: ReactNode }) {
  const { open, disconnect: disconnectSigner, signerInfo, wallet } = ccc.useCcc()
  const [connection, setConnection] = useState<FiberWalletConnection | null>(null)

  useEffect(() => {
    if (!signerInfo || !wallet) {
      setConnection(null)

      return
    }

    let current = true
    void signerInfo.signer.getRecommendedAddress().then((address) => {
      if (!current) return
      const next = { address, walletName: wallet.name }
      setConnection(next)
      emit(FIBER_WALLET_EVENTS.connected, next)
    })

    return () => {
      current = false
    }
  }, [signerInfo, wallet])

  const disconnect = useCallback(() => {
    disconnectSigner()
    setConnection(null)
    emit(FIBER_WALLET_EVENTS.disconnected, null)
  }, [disconnectSigner])

  const approveCapacityTransfer = useCallback(
    async (approval: FiberTransferApproval) => {
      if (!signerInfo) throw new Error('Connect the wallet that will approve this transfer.')

      emit(FIBER_WALLET_EVENTS.approvalRequested, approval)
      try {
        const signer = signerInfo.signer
        const destination = await ccc.Address.fromString(approval.destination, signer.client)
        const transaction = ccc.Transaction.from({
          outputs: [{ capacity: BigInt(approval.amountMinor), lock: destination.script }],
        })
        await transaction.completeInputsByCapacity(signer)
        await transaction.completeFeeBy(signer)
        const reference = await signer.sendTransaction(transaction)
        emit(FIBER_WALLET_EVENTS.approvalSucceeded, { ...approval, reference })

        return reference
      } catch (error) {
        emit(FIBER_WALLET_EVENTS.approvalRejected, { approval, error })
        throw error
      }
    },
    [signerInfo],
  )

  const value = useMemo(
    () => ({ connection, open, disconnect, approveCapacityTransfer }),
    [connection, open, disconnect, approveCapacityTransfer],
  )

  return <FiberWalletContext.Provider value={value}>{children}</FiberWalletContext.Provider>
}

/**
 * CCC ownership for JoyID, Neuron, and compatible CKB wallets.
 * @returns
 */
export function FiberWalletProvider({
  mainnet,
  appName,
  children,
}: {
  mainnet: boolean
  appName: string
  children: ReactNode
}) {
  const clientOwner = useMemo(
    () => (mainnet ? ccc.ClientPublicMainnet.open() : ccc.ClientPublicTestnet.open()),
    [mainnet],
  )

  useEffect(
    () => () => {
      void clientOwner.dispose()
    },
    [clientOwner],
  )

  return (
    <ccc.Provider
      name={appName}
      defaultClient={clientOwner.value}
      signerFilter={async (info) => info.signer.type === ccc.SignerType.CKB}
    >
      <FiberWalletSession>{children}</FiberWalletSession>
    </ccc.Provider>
  )
}

export function useFiberWallet(): FiberWalletContextValue {
  const value = useContext(FiberWalletContext)
  if (!value) throw new Error('useFiberWallet must be used inside FiberWalletProvider.')

  return value
}
