import { randomBytes } from 'node:crypto'

import { ccc } from '@ckb-ccc/core'
import { MisconfiguredError, type LedgerSecret } from '@kweela/ledger'

import type { CkbNetwork } from './CkbNetwork'

/**
 * Where a CKB wallet's authority comes from.
 *
 * An embedded wallet is a secp256k1 key this package generates and hands back
 * sealed, for the application to store encrypted and pass in on every call.
 * The key never leaves that round trip: nothing here logs it, and nothing here
 * keeps it after the signer it produced is gone.
 *
 * Handing the same material to its owner is what taking custody means, which
 * is why the scheme is an ordinary private key rather than something only this
 * package can open.
 */
export class CkbKeyring {
  static readonly SCHEME = 'ckb-secp256k1.v1'

  constructor(private readonly network: CkbNetwork) {}

  /**
   * A new wallet key, sealed in the contract's envelope.
   */
  create(): LedgerSecret {
    return { scheme: CkbKeyring.SCHEME, payload: `0x${randomBytes(32).toString('hex')}` }
  }

  /**
   * The signer a sealed key stands for.
   *
   * @param secret
   * @param client
   * @returns
   */
  signer(secret: LedgerSecret, client: ccc.Client): ccc.SignerCkbPrivateKey {
    if (secret.scheme !== CkbKeyring.SCHEME) {
      throw new MisconfiguredError(
        `This ledger opens ${CkbKeyring.SCHEME} material, not ${secret.scheme}.`,
      )
    }

    return new ccc.SignerCkbPrivateKey(client, this.normalize(secret.payload))
  }

  /**
   * The address a sealed key controls on this network.
   *
   * @param secret
   * @param client
   * @returns
   */
  async addressOf(secret: LedgerSecret, client: ccc.Client): Promise<string> {
    return this.signer(secret, client).getRecommendedAddress()
  }

  /**
   * A key supplied from outside, checked before it is trusted.
   *
   * @param payload
   * @returns
   */
  adopt(payload: string): LedgerSecret {
    return { scheme: CkbKeyring.SCHEME, payload: this.normalize(payload) }
  }

  get addressPrefix(): string {
    return this.network.addressPrefix
  }

  private normalize(payload: string): string {
    const hex = payload.trim().toLowerCase().replace(/^0x/, '')

    if (!/^[0-9a-f]{64}$/.test(hex)) {
      throw new MisconfiguredError('A CKB key is 32 bytes of hexadecimal.')
    }
    if (BigInt(`0x${hex}`) === 0n) {
      throw new MisconfiguredError('A CKB key cannot be zero.')
    }

    return `0x${hex}`
  }
}
