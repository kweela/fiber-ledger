import { MisconfiguredError } from '@kweela/ledger'

import { CkbChain } from './CkbChain'
import { FiberLedger, type FiberLedgerOptions } from './FiberLedger'
import { CkbNetwork, type CkbNetworkName, type CkbScriptDeployments } from './CkbNetwork'
import { FiberClient } from './fiber/FiberClient'
import { FiberPaymentRail, type FiberRoute } from './fiber/FiberPaymentRail'
import { NativeCapacityAsset } from './assets/NativeCapacityAsset'
import { UdtAsset, type UdtAssetOptions } from './assets/UdtAsset'
import { CkbKeyring } from './CkbKeyring'

export { CkbChain } from './CkbChain'
export { CkbKeyring } from './CkbKeyring'
export { FiberLedger, type FiberLedgerOptions } from './FiberLedger'
export {
  CkbNetwork,
  type CkbNetworkName,
  type CkbNetworkOptions,
  type CkbScriptDeployments,
} from './CkbNetwork'
export { CkbAssetStrategy } from './assets/CkbAssetStrategy'
export { NativeCapacityAsset } from './assets/NativeCapacityAsset'
export { UdtAsset, type UdtAssetOptions } from './assets/UdtAsset'
export { JsonRpc } from './JsonRpc'
export * from './fiber/FiberClient'
export { FiberPaymentRail, type FiberRoute } from './fiber/FiberPaymentRail'

export interface FiberLedgerConfig {
  network: CkbNetworkName
  /** A node to talk to instead of the public one. Required for devnet. */
  url?: string
  confirmations?: number

  /**
   * Where this network's scripts are deployed.
   *
   * Only a devnet needs this, and every devnet does: the public deployments
   * the client ships with do not exist on a chain started from scratch, so
   * without them transactions are built naming cells that are not there.
   */
  scripts?: CkbScriptDeployments

  /**
   * What balances are denominated in.
   *
   * `capacity` is CKB itself, which nobody can create. A token is one the
   * platform issues, which is what backing a product currency requires.
   */
  asset?: { kind: 'capacity' } | ({ kind: 'token' } & UdtAssetOptions)

  /** The key that authorises issuance, for a token this platform mints. */
  issuerKey?: string

  /** A Fiber node, for fast off-chain payments. */
  fiber?: {
    url: string
    timeoutMs?: number
    /** Which Fiber node, if any, can be reached for a destination address. */
    routeFor?: (address: string) => Promise<FiberRoute | null> | FiberRoute | null
  }

  idempotency?: FiberLedgerOptions['idempotency']
}

/**
 * Build the ledger from configuration alone.
 *
 * This is what a platform registers. Everything chain-specific is decided here
 * and nothing above it needs to name CKB again.
 * 
 * @param config 
 * @returns 
 */
export function createFiberLedger(config: FiberLedgerConfig): FiberLedger {
  const network = new CkbNetwork({
    name: config.network,
    url: config.url,
    confirmations: config.confirmations,
    scripts: config.scripts,
  })
  const chain = new CkbChain(network)
  const fiber = config.fiber
    ? new FiberPaymentRail(new FiberClient(config.fiber.url, config.fiber.timeoutMs))
    : null

  return new FiberLedger({
    network,
    chain,
    asset: buildAsset(chain, network, config),
    fiber,
    fiberRouteFor: config.fiber?.routeFor,
    idempotency: config.idempotency,
  })
}

function buildAsset(chain: CkbChain, network: CkbNetwork, config: FiberLedgerConfig) {
  const asset = config.asset ?? { kind: 'capacity' as const }

  if (asset.kind === 'capacity') {
    if (config.issuerKey) {
      throw new MisconfiguredError('CKB capacity has no issuer, so an issuer key means nothing.')
    }

    return new NativeCapacityAsset(chain)
  }

  const issuer = config.issuerKey
    ? new CkbKeyring(network).signer(
      { scheme: CkbKeyring.SCHEME, payload: config.issuerKey },
      chain.client,
    )
    : null

  return new UdtAsset(chain, asset, issuer)
}

/**
 * How an application installs this ledger.
 *
 * It reads its own configuration, finds the entry under this descriptor's
 * name, and hands it straight through. Nothing here knows anything about the
 * application above it, which is what keeps the package reusable.
 */
export interface LedgerPlugin<TSettings = FiberLedgerConfig> {
  readonly name: string
  create(settings: TSettings): FiberLedger
}

export const ledgerPlugin: LedgerPlugin = {
  name: 'fiber',
  create: (settings) => createFiberLedger(settings),
}

export default ledgerPlugin
