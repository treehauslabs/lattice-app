import { useState, useEffect, useCallback } from 'react'
import {
  Search, ChevronLeft, ChevronRight, Clock, ArrowRight, ArrowLeft,
  Layers, FileText, Box, GitBranch, User, Database, X, Hash,
} from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { lattice } from '../api/client'
import type {
  BlockInfo, TransactionReceipt, BlockTransactionSummary,
  ChildBlockEntry, FinalityResponse, AccountStateResponse,
} from '../api/types'

function truncate(s: string, n = 20) {
  return s.length > n ? s.slice(0, n) + '...' : s
}

type Tab = 'blocks' | 'state'

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
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null)

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
  }, [block.hash, chain])

  const loadReceipt = async (txCID: string) => {
    if (expandedTx === txCID) { setExpandedTx(null); setReceipt(null); return }
    setExpandedTx(txCID)
    try { setReceipt(await lattice.getReceipt(txCID, chain)) }
    catch { setReceipt(null) }
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

        {/* CID references — collapsed by default */}
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
                    onClick={() => loadReceipt(tx.txCID)}
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
                  {expandedTx === tx.txCID && receipt && (
                    <div className="mx-3 mb-1 p-3 bg-zinc-800/40 rounded-lg text-xs space-y-2">
                      <div className="flex gap-4 text-zinc-500">
                        <span>Status: <span className={receipt.status === 'confirmed' ? 'text-emerald-400' : 'text-yellow-400'}>{receipt.status}</span></span>
                        <span>From: <span className="font-mono text-zinc-400">{truncate(receipt.sender, 20)}</span></span>
                      </div>
                      {receipt.accountActions.length > 0 && (
                        <div className="space-y-1">
                          {receipt.accountActions.map((a, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="font-mono text-zinc-400">{truncate(a.owner, 16)}</span>
                              <ArrowRight size={10} className="text-zinc-600" />
                              <span className={a.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {a.delta >= 0 ? '+' : ''}{a.delta.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
      </div>
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
// Main Explorer
// ============================================================

export function Explorer() {
  const { connected, selectedChain } = useNode()
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [selectedBlock, setSelectedBlock] = useState<BlockInfo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [maxHeight, setMaxHeight] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>('blocks')
  const pageSize = 20

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
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-4">
            <Search size={28} className="text-zinc-700" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-200 mb-2">Explorer</h2>
          <p className="text-zinc-500 text-sm">Connect to a node to explore blocks.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Explorer</h1>

      {/* Search */}
      <div className="relative mb-5">
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
      <div className="flex gap-1 mb-5 bg-zinc-900/80 p-0.5 rounded-xl border border-zinc-800 w-fit">
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
            <div className="mb-5">
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
  )
}
