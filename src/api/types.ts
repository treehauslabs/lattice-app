export interface ChainStatus {
  directory: string
  height: number
  tip: string
  mining: boolean
  mempoolCount: number
  syncing: boolean
}

export interface ChainInfoResponse {
  chains: ChainStatus[]
  genesisHash: string
}

export interface ChainSpec {
  directory: string
  targetBlockTime: number
  initialReward: number
  halvingInterval: number
  maxTransactionsPerBlock: number
  maxStateGrowth: number
  maxBlockSize: number
  premine: number
  premineAmount: number
}

export interface BlockInfo {
  hash: string
  index: number
  timestamp: number
  previousBlock: string | null
  difficulty: string
  nonce: number
  transactionsCID: string
  homesteadCID: string
  frontierCID: string
}

export interface BalanceResponse {
  address: string
  balance: number
}

export interface NonceResponse {
  address: string
  nonce: number
}

export interface MempoolInfo {
  count: number
  totalFees: number
}

export interface PeerInfo {
  publicKey: string
  host: string
  port: number
}

export interface PeersResponse {
  count: number
  peers: PeerInfo[]
}

export interface FeeEstimate {
  fee: number
  target: number
}

export interface FeeHistogram {
  buckets: { range: string; count: number }[]
  blockCount: number
}

export interface TransactionReceipt {
  txCID: string
  blockHash: string
  blockHeight: number
  timestamp: number
  fee: number
  sender: string
  status: string
  accountActions: { owner: string; delta: number }[]
}

export interface TransactionHistoryEntry {
  txCID: string
  blockHash: string
  height: number
}

export interface TransactionHistoryResponse {
  address: string
  transactions: TransactionHistoryEntry[]
  count: number
}

export interface SubmitTransactionRequest {
  signatures: Record<string, string>
  bodyCID: string
  bodyData?: string
}

export interface SubmitTransactionResponse {
  accepted: boolean
  txCID: string
  error?: string
}

export interface FinalityResponse {
  height: number
  currentHeight: number
  confirmations: number
  required: number
  isFinal: boolean
  chain: string
}

export interface PrepareTransactionRequest {
  chainPath: string[]
  nonce: number
  signers: string[]
  fee: number
  accountActions: { owner: string; delta: number }[]
  swapActions?: {
    nonce: string
    sender: string
    recipient: string
    amount: number
    timelock: number
  }[]
  swapClaimActions?: {
    nonce: string
    sender: string
    recipient: string
    amount: number
    timelock: number
    isRefund: boolean
  }[]
  settleActions?: {
    nonce: string
    senderA: string
    senderB: string
    swapKeyA: string
    directoryA: string
    swapKeyB: string
    directoryB: string
  }[]
}

export interface PrepareTransactionResponse {
  bodyCID: string
  bodyData: string
}
