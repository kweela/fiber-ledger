import { MAINNET_SCRIPTS, TESTNET_SCRIPTS } from '@ckb-ccc/core/advanced'

import { MisconfiguredError } from '@kweela/ledger'
import type { Owner } from '@ckb-ccc/core'
import { ccc } from '@ckb-ccc/core'

export type CkbNetworkName = 'mainnet' | 'testnet' | 'devnet'

/**
 * Where a network's well-known scripts live, as CCC names them.
 *
 * A script is code in a cell, and spending a cell locked by one means naming
 * the cell that code sits in. Those locations are fixed per network, so the
 * public ones ship with the client; a private chain deploys its own and has to
 * say where they landed.
 */
export type CkbScriptDeployments = Partial<Record<ccc.KnownScript, ccc.ScriptInfoLike>>

export interface CkbNetworkOptions {
  name: CkbNetworkName
  /** A node to talk to instead of the public one. Required for devnet. */
  url?: string
  /** Blocks at which a transaction is treated as settled. */
  confirmations?: number
  /** Where this network's scripts are deployed. Required for devnet. */
  scripts?: CkbScriptDeployments
}

/**
 * Which CKB this ledger is talking to, and how to reach it.
 *
 * Capacity on CKB is the native asset and is counted in shannons: one CKB is
 * 10^8 of them. A cell must hold enough capacity to pay for the bytes it
 * occupies, which is why the smallest ordinary transfer is not one shannon but
 * a whole occupied cell.
 */
export class CkbNetwork {
  /** One CKB, in shannons. */
  static readonly SHANNONS_PER_CKB = 100_000_000n

  /**
   * The least capacity a plain secp256k1 cell can hold, in shannons.
   *
   * 61 CKB: 8 bytes of capacity, a 33-byte lock script, and no type or data.
   * An output below this is rejected by the chain, so it bounds every transfer
   * and every change cell.
   */
  static readonly MIN_CELL_CAPACITY = 61n * CkbNetwork.SHANNONS_PER_CKB

  /**
   * The least capacity a cell carrying a UDT balance can hold, in shannons.
   *
   * The lock, plus a 33-byte type script and 16 bytes of amount data.
   */
  static readonly MIN_UDT_CELL_CAPACITY = 142n * CkbNetwork.SHANNONS_PER_CKB

  readonly name: CkbNetworkName
  readonly url: string | null
  readonly confirmations: number
  readonly scripts: CkbScriptDeployments | null

  constructor(options: CkbNetworkOptions) {
    if (options.name === 'devnet' && !options.url) {
      throw new MisconfiguredError('A devnet needs the URL of the node to talk to.')
    }

    this.name = options.name
    this.url = options.url ?? null
    this.confirmations = options.confirmations ?? (options.name === 'mainnet' ? 24 : 4)
    this.scripts = options.scripts ?? null
  }

  get isMainnet(): boolean {
    return this.name === 'mainnet'
  }

  /**
   * The address prefix this network's addresses carry.
   */
  get addressPrefix(): string {
    return this.isMainnet ? 'ckb' : 'ckt'
  }

  /**
   * Open a client bound to this network.
   *
   * The caller owns what comes back and must dispose of it. A client holds a
   * transport - the public nodes are reached over a websocket - so one that is
   * never disposed keeps a connection open for the life of the process.
   */
  open(): Owner<ccc.ClientJsonRpc> {
    const config = {
      ...(this.url ? { urls: [this.url] as [string] } : {}),
      ...(this.scripts ? { scripts: this.deployments() } : {}),
    }

    return this.isMainnet
      ? ccc.ClientPublicMainnet.open(config)
      : ccc.ClientPublicTestnet.open(config)
  }

  /**
   * Every script the client may look up, with this network's own on top.
   */
  private deployments(): CkbScriptDeployments {
    const known = this.isMainnet ? MAINNET_SCRIPTS : TESTNET_SCRIPTS

    return { ...known, ...this.scripts }
  }
}
