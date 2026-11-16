import { ccc } from '@ckb-ccc/core'
import { argsToDid, createDidCkb } from '@ckb-ccc/did-ckb'

/** A did:ckb cell for a signer's own lock, ready to sign and send. */
export interface CkbIdentityDraft {
  transaction: ccc.Transaction
  did: string
}

/**
 * Builds the transaction that creates a did:ckb cell owned by the signer.
 *
 * The cell starts with an empty DID document. Its capacity and the fee come from the signer's
 * own cells, so a wallet needs enough CKB to cover the deposit the cell locks.
 */
export class CkbIdentityIssuer {
  static async draft(signer: ccc.Signer): Promise<CkbIdentityDraft> {
    const { tx, id } = await createDidCkb({ signer, data: { value: { document: {} } } })

    await tx.completeInputsByCapacity(signer)
    await tx.completeFeeBy(signer)

    return { transaction: tx, did: argsToDid(id) }
  }
}
