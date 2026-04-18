import type {
  ChainInfoResponse,
  ChainSpec,
  BlockInfo,
  BalanceResponse,
  NonceResponse,
  MempoolInfo,
  PeersResponse,
  FeeEstimate,
  FeeHistogram,
  TransactionReceipt,
  TransactionDetail,
  TransactionHistoryResponse,
  SubmitTransactionRequest,
  SubmitTransactionResponse,
  FinalityResponse,
  PrepareTransactionRequest,
  PrepareTransactionResponse,
  BlockTransactionsResponse,
  BlockChildrenResponse,
  AccountStateResponse,
  StateSummaryResponse,
  DepositStateResponse,
  ReceiptStateResponse,
  DepositsListResponse,
  BlockStateResponse,
  BlockAccountStateResponse,
} from './types'

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let tauriFetchPromise: Promise<FetchFn> | null = null
async function getFetch(): Promise<FetchFn> {
  if (!isTauri) return window.fetch.bind(window)
  if (!tauriFetchPromise) {
    tauriFetchPromise = import('@tauri-apps/plugin-http').then((m) => m.fetch as FetchFn)
  }
  return tauriFetchPromise
}

class LatticeClient {
  private baseUrl: string
  private authToken: string | null = null

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  setBaseUrl(url: string) {
    this.baseUrl = url
  }

  setAuthToken(token: string | null) {
    this.authToken = token
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    const doFetch = await getFetch()
    const res = await doFetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    return res.json()
  }

  async getChainInfo(): Promise<ChainInfoResponse> {
    return this.fetch('/api/chain/info')
  }

  async getChainSpec(chain?: string): Promise<ChainSpec> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/chain/spec${q}`)
  }

  async getBalance(address: string, chain?: string): Promise<BalanceResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/balance/${address}${q}`)
  }

  async getNonce(address: string, chain?: string): Promise<NonceResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/nonce/${address}${q}`)
  }

  async getLatestBlock(chain?: string): Promise<BlockInfo> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/block/latest${q}`)
  }

  async getBlock(id: string | number, chain?: string): Promise<BlockInfo> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/block/${id}${q}`)
  }

  async getBlockTransactions(id: string | number, chain?: string): Promise<BlockTransactionsResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/block/${id}/transactions${q}`)
  }

  async getBlockChildren(id: string | number, chain?: string): Promise<BlockChildrenResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/block/${id}/children${q}`)
  }

  async getMempool(chain?: string): Promise<MempoolInfo> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/mempool${q}`)
  }

  async getPeers(): Promise<PeersResponse> {
    return this.fetch('/api/peers')
  }

  async getFeeEstimate(target: number = 5, chain?: string): Promise<FeeEstimate> {
    const params = new URLSearchParams({ target: String(target) })
    if (chain) params.set('chain', chain)
    return this.fetch(`/api/fee/estimate?${params}`)
  }

  async getFeeHistogram(chain?: string): Promise<FeeHistogram> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/fee/histogram${q}`)
  }

  async getReceipt(txCID: string, chain?: string): Promise<TransactionReceipt> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/receipt/${txCID}${q}`)
  }

  async getTransaction(txCID: string, chain?: string, blockHash?: string): Promise<TransactionDetail> {
    const params = new URLSearchParams()
    if (chain) params.set('chain', chain)
    if (blockHash) params.set('blockHash', blockHash)
    const q = params.toString() ? `?${params}` : ''
    return this.fetch(`/api/transaction/${txCID}${q}`)
  }

  async getTransactionHistory(address: string, chain?: string): Promise<TransactionHistoryResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/transactions/${address}${q}`)
  }

  async getFinality(height: number, chain?: string): Promise<FinalityResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/finality/${height}${q}`)
  }

  async submitTransaction(tx: SubmitTransactionRequest, chain?: string): Promise<SubmitTransactionResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/transaction${q}`, {
      method: 'POST',
      body: JSON.stringify(tx),
    })
  }

  async prepareTransaction(body: PrepareTransactionRequest): Promise<PrepareTransactionResponse> {
    return this.fetch('/api/transaction/prepare', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async startMining(chain: string, identity?: { publicKey: string; privateKey: string }): Promise<{ started: boolean }> {
    return this.fetch('/api/mining/start', {
      method: 'POST',
      body: JSON.stringify({ chain, ...(identity ?? {}) }),
    })
  }

  async stopMining(chain: string): Promise<{ stopped: boolean }> {
    return this.fetch('/api/mining/stop', {
      method: 'POST',
      body: JSON.stringify({ chain }),
    })
  }

  async getAccountState(address: string, chain?: string): Promise<AccountStateResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/state/account/${address}${q}`)
  }

  async getStateSummary(chain?: string): Promise<StateSummaryResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/state/summary${q}`)
  }

  async getDepositState(params: { demander: string; amount: number; nonce: string; chain: string }): Promise<DepositStateResponse> {
    const q = new URLSearchParams({
      demander: params.demander,
      amount: String(params.amount),
      nonce: params.nonce,
      chain: params.chain,
    })
    return this.fetch(`/api/deposit?${q}`)
  }

  async listDeposits(chain: string, limit?: number): Promise<DepositsListResponse> {
    const params = new URLSearchParams({ chain })
    if (limit) params.set('limit', String(limit))
    return this.fetch(`/api/deposits?${params}`)
  }

  async getBlockState(blockId: string | number, chain?: string): Promise<BlockStateResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/block/${blockId}/state${q}`)
  }

  async getBlockAccountState(blockId: string | number, address: string, chain?: string): Promise<BlockAccountStateResponse> {
    const q = chain ? `?chain=${encodeURIComponent(chain)}` : ''
    return this.fetch(`/api/block/${blockId}/state/account/${address}${q}`)
  }

  async getReceiptState(params: { demander: string; amount: number; nonce: string; directory: string }): Promise<ReceiptStateResponse> {
    const q = new URLSearchParams({
      demander: params.demander,
      amount: String(params.amount),
      nonce: params.nonce,
      directory: params.directory,
    })
    return this.fetch(`/api/receipt-state?${q}`)
  }
}

export const lattice = new LatticeClient()
