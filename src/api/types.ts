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
  nexus: string
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
  nextDifficulty: string
  nonce: number
  version: number
  transactionsCID: string
  homesteadCID: string
  frontierCID: string
  parentHomesteadCID: string
  specCID: string
  childBlocksCID: string
  transactionCount: number
  childBlockCount: number
  chain: string
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
  depositActions?: {
    nonce: string
    demander: string
    amountDemanded: number
    amountDeposited: number
  }[]
  receiptActions?: {
    withdrawer: string
    nonce: string
    demander: string
    amountDemanded: number
    directory: string
  }[]
  withdrawalActions?: {
    withdrawer: string
    nonce: string
    demander: string
    amountDemanded: number
    amountWithdrawn: number
  }[]
}

export interface PrepareTransactionResponse {
  bodyCID: string
  bodyData: string
}

export interface BlockTransactionSummary {
  txCID: string
  bodyCID: string
  fee: number
  nonce: number
  signers: string[]
  accountActionCount: number
  depositActionCount: number
  receiptActionCount: number
  withdrawalActionCount: number
}

export interface BlockTransactionsResponse {
  transactions: BlockTransactionSummary[]
  count: number
  blockHash: string
}

export interface ChildBlockEntry {
  directory: string
  blockHash: string
  index: number
  timestamp: number
  difficulty: string
  transactionCount: number
}

export interface BlockChildrenResponse {
  children: ChildBlockEntry[]
  count: number
}

export interface AccountStateResponse {
  address: string
  chain: string
  balance: number
  nonce: number
  exists: boolean
  recentTransactions: TransactionHistoryEntry[]
  transactionCount: number
}

export interface StateSummaryResponse {
  chain: string
  height: number
  tip: string
  stateRoot: string
}

export interface DepositStateResponse {
  exists: boolean
  amountDeposited?: number
  chain: string
  key: string
}

export interface ReceiptStateResponse {
  exists: boolean
  withdrawer?: string
  directory: string
  key: string
}

export interface DepositEntry {
  key: string
  demander: string
  amountDemanded: number
  nonce: string
  amountDeposited: number
}

export interface DepositsListResponse {
  deposits: DepositEntry[]
  count: number
  chain: string
}
