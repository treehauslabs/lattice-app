import { useState, useEffect, useCallback } from 'react'
import {
  Blocks, Clock, TrendingUp, Layers, ChevronRight,
  Search, ChevronLeft, ArrowRight, ArrowLeft,
  FileText, Box, GitBranch, User, Database, X, Hash,
  Timer, Coins, BarChart3, Gauge, HardDrive, Scale, Pickaxe,
  Users, Filter, Sliders,
} from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { useWallet } from '../hooks/useWallet'
import { lattice } from '../api/client'
import type {
  BlockInfo, FeeEstimate, ChainSpec, TransactionDetail,
  BlockTransactionSummary, ChildBlockEntry, FinalityResponse,
  AccountStateResponse, BlockStateResponse, BlockAccountStateResponse,
} from '../api/types'

function truncate(s: string, n = 20) {
  return s.length > n ? s.slice(0, n) + '...' : s
}

type Tab = 'blocks' | 'state'
type ParamsTab = 'rules' | 'txFilters' | 'actionFilters'

// ============================================================
// Chain Rules
// ============================================================

function ChainRules({ spec, height }: { spec: ChainSpec; height: number }) {
  const reward = currentReward(spec, height)
  const halvings = spec.halvingInterval > 0 ? Math.floor(height / spec.halvingInterval) : 0
  const blocksToNextHalving = spec.halvingInterval > 0
    ? spec.halvingInterval - (height % spec.halvingInterval)
    : 0
  const timeToHalving = blocksToNextHalving * spec.targetBlockTime / 1000
  const totalSupply = computeTotalSupply(spec)
  const minedSoFar = computeMinedSoFar(spec, height)
  const minedPct = totalSupply > 0 ? (minedSoFar / totalSupply) * 100 : 0

  const rules: { icon: typeof Coins; label: string; value: string; sub?: string }[] = [
    {
      icon: Timer,
      label: 'Block Time',
      value: `${spec.targetBlockTime / 1000}s`,
      sub: 'target interval',
    },
    {
      icon: Coins,
      label: 'Block Reward',
      value: reward.toLocaleString(),
      sub: halvings > 0 ? `${halvings} halvings` : 'no halvings yet',
    },
    {
      icon: Scale,
      label: 'Halving',
      value: spec.halvingInterval.toLocaleString(),
      sub: blocksToNextHalving > 0 ? `next in ${formatDuration(timeToHalving)}` : undefined,
    },
    {
      icon: BarChart3,
      label: 'Supply',
      value: formatLargeNumber(totalSupply),
      sub: `${minedPct.toFixed(2)}% emitted`,
    },
    {
      icon: Gauge,
      label: 'Max Txs / Block',
      value: spec.maxTransactionsPerBlock.toLocaleString(),
    },
    {
      icon: HardDrive,
      label: 'Max Block Size',
      value: formatBytes(spec.maxBlockSize),
      sub: `state growth ${formatBytes(spec.maxStateGrowth)}/blk`,
    },
  ]

  if (spec.premineAmount > 0) {
    rules.push({
      icon: Pickaxe,
      label: 'Premine',
      value: formatLargeNumber(spec.premineAmount),
      sub: `${((spec.premineAmount / totalSupply) * 100).toFixed(1)}% of supply`,
    })
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {rules.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="bg-zinc-900/60 rounded-xl px-4 py-3.5 border border-zinc-800/40">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-zinc-800/80 flex items-center justify-center">
              <Icon size={12} className="text-zinc-400" />
            </div>
            <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
          </div>
          <div className="text-sm font-semibold text-zinc-200">{value}</div>
          {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
        </div>
      ))}
    </div>
  )
}

function FilterList({ filters, emptyMessage }: { filters: string[]; emptyMessage: string }) {
  if (filters.length === 0) {
    return <div className="text-xs text-zinc-600 italic px-1 py-2">{emptyMessage}</div>
  }
  return (
    <div className="space-y-2">
      {filters.map((src, i) => (
        <pre
          key={i}
          className="bg-zinc-950/60 border border-zinc-800/60 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all overflow-x-auto"
        >
          {src}
        </pre>
      ))}
    </div>
  )
}

function ChainParameters({ spec, height }: { spec: ChainSpec; height: number }) {
  const [tab, setTab] = useState<ParamsTab>('rules')
  const txFilters = spec.transactionFilters ?? []
  const actionFilters = spec.actionFilters ?? []

  const tabs: { key: ParamsTab; label: string; count?: number; icon: typeof Box }[] = [
    { key: 'rules', label: 'Rules', icon: Sliders },
    { key: 'txFilters', label: 'Tx Filters', count: txFilters.length, icon: Filter },
    { key: 'actionFilters', label: 'Action Filters', count: actionFilters.length, icon: Filter },
  ]

  return (
    <div className="bg-zinc-900/80 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-1 px-3 pt-3 border-b border-zinc-800/60">
        {tabs.map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
              tab === key
                ? 'text-zinc-100 bg-zinc-800/60'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon size={12} /> {label}
            {count !== undefined && (
              <span className={`tabular-nums text-[10px] ${tab === key ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === 'rules' && <ChainRules spec={spec} height={height} />}
        {tab === 'txFilters' && (
          <FilterList filters={txFilters} emptyMessage="No filters — all valid transactions accepted" />
        )}
        {tab === 'actionFilters' && (
          <FilterList filters={actionFilters} emptyMessage="No filters — all valid actions accepted" />
        )}
      </div>
    </div>
  )
}

// ============================================================
// Block Detail
// ============================================================

function BlockDetail({
  block, onClose, onNavigate, chain,
}: {
  block: BlockInfo; onClose: () => void; onNavigate: (id: string | number) => void; chain: string
}) {
  const [transactions, setTransactions] = useState<BlockTransactionSummary[]>([])
  const [children, setChildren] = useState<ChildBlockEntry[]>([])
  const [finality, setFinality] = useState<FinalityResponse | null>(null)
  const [loadingTx, setLoadingTx] = useState(false)
  const [expandedTx, setExpandedTx] = useState<string | null>(null)
  const [txDetail, setTxDetail] = useState<TransactionDetail | null>(null)
  const [blockState, setBlockState] = useState<BlockStateResponse | null>(null)
  const [stateQuery, setStateQuery] = useState('')
  const [stateResult, setStateResult] = useState<BlockAccountStateResponse | null>(null)
  const [stateLoading, setStateLoading] = useState(false)

  useEffect(() => {
    setLoadingTx(true)
    lattice.getBlockTransactions(block.hash, chain)
      .then(r => setTransactions(r.transactions))
      .catch(() => {})
      .finally(() => setLoadingTx(false))

    if (block.childBlockCount > 0) {
      lattice.getBlockChildren(block.hash, chain).then(r => setChildren(r.children)).catch(() => {})
    } else {
      setChildren([])
    }

    lattice.getFinality(block.index, chain).then(setFinality).catch(() => {})
    lattice.getBlockState(block.hash, chain).then(setBlockState).catch(() => {})
  }, [block.hash, chain])

  const lookupAccountAtBlock = async () => {
    if (!stateQuery.trim()) return
    setStateLoading(true)
    try {
      setStateResult(await lattice.getBlockAccountState(block.hash, stateQuery.trim(), chain))
    } catch {
      setStateResult(null)
    }
    setStateLoading(false)
  }

  const loadTransaction = async (txCID: string) => {
    if (expandedTx === txCID) { setExpandedTx(null); setTxDetail(null); return }
    setExpandedTx(txCID)
    try { setTxDetail(await lattice.getTransaction(txCID, chain, block.hash)) }
    catch { setTxDetail(null) }
  }

  return (
    <div className="bg-zinc-900/80 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
        <div className="flex items-center gap-3">
          <button
            onClick={() => block.previousBlock && onNavigate(block.index - 1)}
            disabled={!block.previousBlock}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <h3 className="font-semibold">Block #{block.index.toLocaleString()}</h3>
          <button
            onClick={() => onNavigate(block.index + 1)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {finality && (
            <span className={`text-[11px] px-2 py-1 rounded-lg font-medium ${
              finality.isFinal
                ? 'bg-emerald-600/15 text-emerald-400'
                : 'bg-yellow-600/15 text-yellow-400'
            }`}>
              {finality.isFinal ? 'Final' : `${finality.confirmations}/${finality.required}`}
            </span>
          )}
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Block header fields */}
        <Section icon={Box} title="Header">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {([
              ['Hash', block.hash],
              ['Previous', block.previousBlock || 'Genesis'],
              ['Timestamp', new Date(block.timestamp).toLocaleString()],
              ['Version', String(block.version)],
              ['Difficulty', block.difficulty],
              ['Nonce', block.nonce.toLocaleString()],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex text-xs">
                <dt className="w-24 text-zinc-500 shrink-0 py-0.5">{label}</dt>
                <dd className="text-zinc-300 break-all font-mono py-0.5">
                  {label === 'Previous' && value !== 'Genesis' ? (
                    <button onClick={() => onNavigate(block.index - 1)} className="text-lattice-400 hover:underline">
                      {truncate(value, 28)}
                    </button>
                  ) : truncate(value, 36)}
                </dd>
              </div>
            ))}
          </div>
        </Section>

        {/* CID references */}
        <CollapsibleSection icon={Database} title="Content References" count={6}>
          <div className="space-y-1.5">
            {([
              ['Transactions', block.transactionsCID, `${block.transactionCount} txs`],
              ['Homestead', block.homesteadCID, 'post-block state'],
              ['Frontier', block.frontierCID, 'pre-block state'],
              ['Parent State', block.parentHomesteadCID, ''],
              ['Spec', block.specCID, ''],
              ['Children', block.childBlocksCID, `${block.childBlockCount}`],
            ] as const).map(([label, cid, note]) => (
              <div key={label} className="flex items-baseline gap-2 text-xs">
                <dt className="w-24 text-zinc-500 shrink-0">{label}</dt>
                <dd className="font-mono text-zinc-500 break-all flex-1">{cid}</dd>
                {note && <span className="text-[10px] text-zinc-600 whitespace-nowrap">{note}</span>}
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Transactions */}
        <Section icon={FileText} title={`Transactions (${block.transactionCount})`}>
          {loadingTx ? (
            <p className="text-xs text-zinc-600 py-3">Loading...</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-zinc-600 py-3">No transactions in this block</p>
          ) : (
            <div className="space-y-1">
              {transactions.map(tx => (
                <div key={tx.txCID}>
                  <button
                    onClick={() => loadTransaction(tx.txCID)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors ${
                      expandedTx === tx.txCID ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lattice-400">{truncate(tx.txCID, 28)}</span>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <span>Fee {tx.fee.toLocaleString()}</span>
                        <TxBadges tx={tx} />
                      </div>
                    </div>
                  </button>
                  {expandedTx === tx.txCID && txDetail && (
                    <TransactionDetailView tx={txDetail} />
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Child blocks */}
        {children.length > 0 && (
          <Section icon={GitBranch} title={`Child Blocks (${children.length})`}>
            <div className="space-y-1">
              {children.map(child => (
                <div key={child.directory} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 text-xs transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-zinc-200">{child.directory}</span>
                    <span className="text-zinc-500">#{child.index.toLocaleString()}</span>
                    <span className="text-zinc-600">{child.transactionCount} txs</span>
                  </div>
                  <span className="text-zinc-500">{new Date(child.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Block State */}
        <Section icon={Layers} title="State at Block">
          {blockState && (
            <div className="space-y-3">
              <CollapsibleSection icon={Database} title="State Roots" count={blockState.sections.length}>
                <div className="space-y-1.5">
                  {blockState.sections.map(s => (
                    <div key={s.name} className="flex items-baseline gap-2 text-xs">
                      <dt className="w-32 text-zinc-500 shrink-0">{s.name}</dt>
                      <dd className="font-mono text-zinc-500 break-all flex-1">{s.cid}</dd>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input
                    value={stateQuery}
                    onChange={e => setStateQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && lookupAccountAtBlock()}
                    placeholder="Look up account balance at this block..."
                    className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
                  />
                </div>
                <button
                  onClick={lookupAccountAtBlock}
                  disabled={stateLoading}
                  className="px-3 py-2 bg-lattice-600 hover:bg-lattice-500 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {stateLoading ? '...' : 'Lookup'}
                </button>
              </div>

              {stateResult && (
                <div className="bg-zinc-800/40 rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-zinc-400 break-all">{stateResult.address}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      stateResult.exists ? 'bg-emerald-600/15 text-emerald-400' : 'bg-zinc-700 text-zinc-500'
                    }`}>
                      {stateResult.exists ? 'Active' : 'Unknown'}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-zinc-200">{stateResult.balance.toLocaleString()}</div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">Balance at block #{stateResult.blockHeight.toLocaleString()}</div>
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ============================================================
// State Explorer
// ============================================================

function StateExplorer({ chain }: { chain: string }) {
  const [query, setQuery] = useState('')
  const [account, setAccount] = useState<AccountStateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const lookup = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      setAccount(await lattice.getAccountState(query.trim(), chain))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
      setAccount(null)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder="Look up account by address..."
            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
          />
        </div>
        <button onClick={lookup} disabled={loading} className="px-5 py-3 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          {loading ? '...' : 'Lookup'}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {account && (
        <div className="bg-zinc-900/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Account</h3>
            <span className={`text-[11px] px-2 py-0.5 rounded-lg font-medium ${
              account.exists ? 'bg-emerald-600/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {account.exists ? 'Active' : 'Unknown'}
            </span>
          </div>

          <div className="bg-zinc-800/40 rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-1">Balance on {account.chain}</div>
            <div className="text-2xl font-bold">{account.balance.toLocaleString()}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-zinc-800/40 rounded-lg p-3">
              <div className="text-[11px] text-zinc-500 mb-0.5">Nonce</div>
              <div className="font-medium">{account.nonce}</div>
            </div>
            <div className="bg-zinc-800/40 rounded-lg p-3">
              <div className="text-[11px] text-zinc-500 mb-0.5">Transactions</div>
              <div className="font-medium">{account.transactionCount}</div>
            </div>
          </div>

          <div className="text-xs text-zinc-600 font-mono break-all">{account.address}</div>

          {account.recentTransactions.length > 0 && (
            <div>
              <h4 className="text-[11px] text-zinc-500 font-medium mb-2 uppercase tracking-wider">Recent Transactions</h4>
              <div className="space-y-0.5">
                {account.recentTransactions.map(tx => (
                  <div key={tx.txCID} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/50 text-xs transition-colors">
                    <span className="font-mono text-lattice-400">{truncate(tx.txCID, 28)}</span>
                    <span className="text-zinc-500">Block #{tx.height}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Shared components
// ============================================================

function TransactionDetailView({ tx }: { tx: TransactionDetail }) {
  return (
    <div className="mx-3 mb-1 p-3 bg-zinc-800/40 rounded-lg text-xs space-y-3">
      {/* Header info */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <div className="flex">
          <dt className="w-20 text-zinc-500 shrink-0">Fee</dt>
          <dd className="text-zinc-300">{tx.fee.toLocaleString()}</dd>
        </div>
        <div className="flex">
          <dt className="w-20 text-zinc-500 shrink-0">Nonce</dt>
          <dd className="text-zinc-300">{tx.nonce.toLocaleString()}</dd>
        </div>
        {tx.chainPath.length > 0 && (
          <div className="flex col-span-2">
            <dt className="w-20 text-zinc-500 shrink-0">Chain</dt>
            <dd className="text-zinc-300">{tx.chainPath.join(' / ')}</dd>
          </div>
        )}
        <div className="flex col-span-2">
          <dt className="w-20 text-zinc-500 shrink-0">Body CID</dt>
          <dd className="font-mono text-zinc-500 break-all">{tx.bodyCID}</dd>
        </div>
      </div>

      {/* Signers */}
      {tx.signers.length > 0 && (
        <div>
          <h5 className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Signers ({tx.signers.length})</h5>
          <div className="space-y-0.5">
            {tx.signers.map((s, i) => (
              <div key={i} className="font-mono text-zinc-400 break-all">{s}</div>
            ))}
          </div>
        </div>
      )}

      {/* Account Actions */}
      {tx.accountActions.length > 0 && (
        <div>
          <h5 className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-1">Account Actions ({tx.accountActions.length})</h5>
          <div className="space-y-1">
            {tx.accountActions.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-mono text-zinc-400">{truncate(a.owner, 16)}</span>
                <ArrowRight size={10} className="text-zinc-600" />
                <span className={a.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {a.delta >= 0 ? '+' : ''}{a.delta.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deposit Actions */}
      {tx.depositActions.length > 0 && (
        <div>
          <h5 className="text-[10px] text-orange-400/70 font-medium uppercase tracking-wider mb-1">Deposits ({tx.depositActions.length})</h5>
          <div className="space-y-1.5">
            {tx.depositActions.map((d, i) => (
              <div key={i} className="bg-zinc-900/60 rounded-md p-2 space-y-0.5">
                <div className="flex gap-4">
                  <span className="text-zinc-500">Demander: <span className="font-mono text-zinc-400">{truncate(d.demander, 16)}</span></span>
                </div>
                <div className="flex gap-4">
                  <span className="text-zinc-500">Demanded: <span className="text-zinc-300">{d.amountDemanded.toLocaleString()}</span></span>
                  <span className="text-zinc-500">Deposited: <span className="text-orange-400">{d.amountDeposited.toLocaleString()}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receipt Actions */}
      {tx.receiptActions.length > 0 && (
        <div>
          <h5 className="text-[10px] text-purple-400/70 font-medium uppercase tracking-wider mb-1">Receipts ({tx.receiptActions.length})</h5>
          <div className="space-y-1.5">
            {tx.receiptActions.map((r, i) => (
              <div key={i} className="bg-zinc-900/60 rounded-md p-2 space-y-0.5">
                <div className="flex gap-4">
                  <span className="text-zinc-500">Withdrawer: <span className="font-mono text-zinc-400">{truncate(r.withdrawer, 16)}</span></span>
                  <span className="text-zinc-500">Dir: <span className="text-zinc-300">{r.directory}</span></span>
                </div>
                <div className="flex gap-4">
                  <span className="text-zinc-500">Demander: <span className="font-mono text-zinc-400">{truncate(r.demander, 16)}</span></span>
                  <span className="text-zinc-500">Amount: <span className="text-purple-400">{r.amountDemanded.toLocaleString()}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Withdrawal Actions */}
      {tx.withdrawalActions.length > 0 && (
        <div>
          <h5 className="text-[10px] text-cyan-400/70 font-medium uppercase tracking-wider mb-1">Withdrawals ({tx.withdrawalActions.length})</h5>
          <div className="space-y-1.5">
            {tx.withdrawalActions.map((w, i) => (
              <div key={i} className="bg-zinc-900/60 rounded-md p-2 space-y-0.5">
                <div className="flex gap-4">
                  <span className="text-zinc-500">Withdrawer: <span className="font-mono text-zinc-400">{truncate(w.withdrawer, 16)}</span></span>
                </div>
                <div className="flex gap-4">
                  <span className="text-zinc-500">Demanded: <span className="text-zinc-300">{w.amountDemanded.toLocaleString()}</span></span>
                  <span className="text-zinc-500">Withdrawn: <span className="text-cyan-400">{w.amountWithdrawn.toLocaleString()}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Box; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] text-zinc-500 font-medium mb-2 flex items-center gap-1.5 uppercase tracking-wider">
        <Icon size={12} /> {title}
      </h4>
      {children}
    </div>
  )
}

function CollapsibleSection({ icon: Icon, title, count, children }: { icon: typeof Box; title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium uppercase tracking-wider hover:text-zinc-400 transition-colors"
      >
        <Icon size={12} /> {title}
        <span className="text-zinc-600 normal-case">({count})</span>
        <ChevronRight size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

function TxBadges({ tx }: { tx: BlockTransactionSummary }) {
  const badges: { label: string; color: string }[] = []
  if (tx.accountActionCount > 0) badges.push({ label: `${tx.accountActionCount} acct`, color: 'text-blue-400' })
  if (tx.depositActionCount > 0) badges.push({ label: `${tx.depositActionCount} dep`, color: 'text-orange-400' })
  if (tx.receiptActionCount > 0) badges.push({ label: `${tx.receiptActionCount} rcpt`, color: 'text-purple-400' })
  if (tx.withdrawalActionCount > 0) badges.push({ label: `${tx.withdrawalActionCount} wdrl`, color: 'text-cyan-400' })
  return (
    <div className="flex gap-1.5">
      {badges.map(b => <span key={b.label} className={b.color}>{b.label}</span>)}
    </div>
  )
}

// ============================================================
// Main Explorer
// ============================================================

function StatTile({
  icon: Icon, label, value, sub, accent,
}: { icon: typeof Box; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-zinc-900/60 rounded-xl px-3 py-3 border border-zinc-800/40 min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={11} className={accent ?? 'text-zinc-500'} />
        <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm font-semibold text-zinc-100 tabular-nums truncate">{value}</div>
      {sub && <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

function formatAge(ms: number): string {
  if (ms < 0) return 'now'
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  return `${Math.floor(ms / 3_600_000)}h ago`
}

export function Explorer() {
  const { chains, peers, connected, selectedChain, setSelectedChain, error } = useNode()
  const { activeAccount } = useWallet()
  const [latestBlock, setLatestBlock] = useState<BlockInfo | null>(null)
  const [fee, setFee] = useState<FeeEstimate | null>(null)
  const [chainBalances, setChainBalances] = useState<Record<string, number>>({})
  const [spec, setSpec] = useState<ChainSpec | null>(null)

  // Explorer state
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [selectedBlock, setSelectedBlock] = useState<BlockInfo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [maxHeight, setMaxHeight] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>('blocks')
  const pageSize = 20

  const chain = chains.find(c => c.directory === selectedChain)

  useEffect(() => {
    if (!connected) return
    lattice.getLatestBlock(selectedChain).then(setLatestBlock).catch(() => {})
    lattice.getFeeEstimate(5, selectedChain).then(setFee).catch(() => {})
    lattice.getChainSpec(selectedChain).then(setSpec).catch(() => {})
  }, [connected, selectedChain, chain?.height])

  useEffect(() => {
    if (!connected || !activeAccount) return
    const fetchBalances = async () => {
      const results: Record<string, number> = {}
      for (const c of chains) {
        try {
          const b = await lattice.getBalance(activeAccount.address, c.directory)
          results[c.directory] = b.balance
        } catch {
          results[c.directory] = 0
        }
      }
      setChainBalances(results)
    }
    fetchBalances()
  }, [connected, chains.length, activeAccount?.address])

  const loadBlocks = useCallback(async () => {
    if (!connected) return
    try {
      const latest = await lattice.getLatestBlock(selectedChain)
      setMaxHeight(latest.index)
      const start = Math.max(0, latest.index - page * pageSize - pageSize + 1)
      const end = Math.max(0, latest.index - page * pageSize)
      const fetches: Promise<BlockInfo>[] = []
      for (let i = end; i >= start; i--) fetches.push(lattice.getBlock(i, selectedChain))
      setBlocks(await Promise.all(fetches))
    } catch {}
  }, [connected, selectedChain, page])

  useEffect(() => { loadBlocks() }, [loadBlocks])

  const navigateToBlock = async (id: string | number) => {
    try { setSelectedBlock(await lattice.getBlock(id, selectedChain)) } catch {}
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    const q = searchQuery.trim()
    try { setSelectedBlock(await lattice.getBlock(q, selectedChain)); return } catch {}
    try {
      const r = await lattice.getReceipt(q, selectedChain)
      setSelectedBlock(await lattice.getBlock(r.blockHeight, selectedChain)); return
    } catch {}
    try {
      const state = await lattice.getAccountState(q, selectedChain)
      if (state.exists) setActiveTab('state')
    } catch {}
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-lattice-600/10 flex items-center justify-center mx-auto mb-4">
            <Blocks size={28} className="text-lattice-500" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-200 mb-2">No Node Connected</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Start a Lattice node with <code className="text-lattice-400 bg-zinc-900 px-1.5 py-0.5 rounded">--rpc-port 8080</code> and this app will connect automatically.
          </p>
          {error && <p className="text-red-400 text-xs mt-4">{error}</p>}
        </div>
      </div>
    )
  }

  const totalBalance = Object.values(chainBalances).reduce((a, b) => a + b, 0)
  const lastBlockAge = latestBlock?.timestamp
    ? formatAge(Date.now() - latestBlock.timestamp)
    : null
  const targetBlockSecs = spec ? spec.targetBlockTime / 1000 : null
  const statusLabel = chain?.syncing
    ? 'Syncing'
    : chain?.mining
      ? 'Mining'
      : 'Synced'
  const statusColor = chain?.syncing
    ? 'text-yellow-400'
    : chain?.mining
      ? 'text-emerald-400'
      : 'text-zinc-400'

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Hero banner */}
      <div className="bg-gradient-to-br from-lattice-900/40 via-zinc-900/80 to-zinc-900/80 rounded-2xl p-5 border border-lattice-800/20 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{selectedChain}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${chain?.syncing ? 'bg-yellow-400' : 'bg-emerald-400'} animate-pulse`} />
              <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-500 font-mono">
                #{chain?.height.toLocaleString() ?? '0'}
              </span>
            </div>
          </div>
        </div>

        {/* Live stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatTile
            icon={Users}
            label="Peers"
            value={(peers?.count ?? 0).toLocaleString()}
            accent="text-lattice-400"
          />
          <StatTile
            icon={Layers}
            label="Mempool"
            value={(chain?.mempoolCount ?? 0).toLocaleString()}
            sub="pending txs"
          />
          <StatTile
            icon={TrendingUp}
            label="Fee"
            value={fee ? fee.fee.toLocaleString() : '—'}
            sub="est. for 5 blks"
          />
          <StatTile
            icon={Clock}
            label="Last block"
            value={lastBlockAge ?? '—'}
            sub={targetBlockSecs ? `target ${targetBlockSecs}s` : undefined}
          />
        </div>
      </div>

      {/* Chain selector (multi-chain) */}
      {chains.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {chains.map(c => (
            <button
              key={c.directory}
              onClick={() => setSelectedChain(c.directory)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                c.directory === selectedChain
                  ? 'bg-lattice-600/10 text-lattice-400 border border-lattice-700/30'
                  : 'bg-zinc-900/80 text-zinc-400 border border-zinc-800/40 hover:border-zinc-700/40 hover:text-zinc-300'
              }`}
            >
              <span>{c.directory}</span>
              <span className="text-zinc-600 tabular-nums">#{c.height.toLocaleString()}</span>
              {c.mining && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              {c.syncing && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
            </button>
          ))}
        </div>
      )}

      {/* Chain specification & filters */}
      {spec && <ChainParameters spec={spec} height={chain?.height ?? 0} />}

      {/* Portfolio card */}
      {activeAccount && (
        <div className="bg-zinc-900/80 rounded-2xl p-5">
          <div className="text-xs text-zinc-500 mb-1">Total Balance</div>
          <div className="text-3xl font-bold mb-3">{totalBalance.toLocaleString()}</div>
          {chains.length > 1 && (
            <div className="flex gap-3 flex-wrap">
              {chains.map(c => (
                <div key={c.directory} className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-400">{c.directory}</span>
                  <span className="tabular-nums">{(chainBalances[c.directory] ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Explorer section */}
      <div>
        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by block height, hash, tx CID, or address..."
            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-900/80 p-0.5 rounded-xl border border-zinc-800 w-fit">
          {(['blocks', 'state'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === t ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'blocks' ? <><Layers size={13} /> Blocks</> : <><Database size={13} /> State</>}
            </button>
          ))}
        </div>

        {activeTab === 'state' && <StateExplorer chain={selectedChain} />}

        {activeTab === 'blocks' && (
          <>
            {selectedBlock && (
              <div className="mb-4">
                <BlockDetail block={selectedBlock} onClose={() => setSelectedBlock(null)} onNavigate={navigateToBlock} chain={selectedChain} />
              </div>
            )}

            {/* Block list */}
            <div className="bg-zinc-900/80 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/60">
                <h2 className="text-sm font-semibold">Recent Blocks</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => p + 1)} disabled={page * pageSize >= maxHeight} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-zinc-500 tabular-nums">Page {page + 1}</span>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-20 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="divide-y divide-zinc-800/40">
                {blocks.map(b => (
                  <button
                    key={b.hash}
                    onClick={() => setSelectedBlock(b)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Hash size={12} className="text-zinc-600" />
                        <span className="font-medium tabular-nums">{b.index.toLocaleString()}</span>
                      </div>
                      <span className="font-mono text-xs text-zinc-500">{truncate(b.hash, 20)}</span>
                    </div>
                    <div className="flex items-center gap-5 text-xs text-zinc-500">
                      <span className="tabular-nums">{b.transactionCount} txs</span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock size={11} /> {new Date(b.timestamp).toLocaleTimeString()}
                      </span>
                      <ChevronRight size={14} className="text-zinc-700" />
                    </div>
                  </button>
                ))}
                {blocks.length === 0 && (
                  <div className="px-5 py-10 text-center text-zinc-600 text-sm">No blocks found</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString()
}

function formatDuration(seconds: number): string {
  if (seconds >= 86400 * 365) return `${(seconds / (86400 * 365)).toFixed(1)}y`
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds)}s`
}

function currentReward(spec: ChainSpec, height: number): number {
  if (spec.halvingInterval === 0) return spec.initialReward
  const halvings = Math.floor(height / spec.halvingInterval)
  if (halvings >= 64) return 0
  return Math.floor(spec.initialReward / Math.pow(2, halvings))
}

function computeTotalSupply(spec: ChainSpec): number {
  if (spec.halvingInterval === 0) return 0
  // geometric series: totalSupply ≈ 2 * halvingInterval * initialReward
  return 2 * spec.halvingInterval * spec.initialReward
}

function computeMinedSoFar(spec: ChainSpec, height: number): number {
  if (spec.halvingInterval === 0 || height === 0) return 0
  let total = spec.premineAmount
  let reward = spec.initialReward
  let remaining = height
  while (remaining > 0 && reward > 0) {
    const blocksInEra = Math.min(remaining, spec.halvingInterval - ((height - remaining) % spec.halvingInterval))
    total += blocksInEra * reward
    remaining -= blocksInEra
    reward = Math.floor(reward / 2)
  }
  return total
}
