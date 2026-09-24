import { LedgerUnavailableError } from '@kweela/ledger'

/**
 * A JSON-RPC caller for nodes this package talks to directly.
 *
 * CKB and Fiber both speak JSON-RPC over HTTP, and neither exposes everything
 * this package needs through a typed SDK. Calls go through one place so a node
 * that is unreachable, slow, or answering with an error reads the same way
 * wherever it happens.
 */
export class JsonRpc {
  private id = 0

  constructor(
    readonly url: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: (this.id += 1), method, params })
    const response = await this.post(body, method)

    if (!response.ok) {
      throw new LedgerUnavailableError(`${method} answered ${response.status}.`)
    }

    const payload = (await response.json()) as { result?: T; error?: { message?: string } }

    if (payload.error) {
      throw new LedgerUnavailableError(`${method} failed: ${payload.error.message ?? 'unknown'}`)
    }

    return payload.result as T
  }

  private async post(body: string, method: string): Promise<Response> {
    try {
      return await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new LedgerUnavailableError(`${method} could not reach ${this.url}.`, error)
    }
  }
}
