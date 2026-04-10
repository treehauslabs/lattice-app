import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, Clock, Hash, ArrowRight } from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { lattice } from '../api/client'
import type { BlockInfo, TransactionReceipt } from '../api/types'

function truncate(s: string, n = 20) {
  return s.length > n ? s.slice(0, n) + '...' : s
}

function BlockDetail({ block, onClose }: { block: BlockInfo; onClose: () => void }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Block #{block.index.toLocaleString()}</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">Close</button>
      </div>
      <dl className="space-y-2 text-sm">
        {([
          ['Hash', block.hash],
          ['Previous', block.previousBlock || 'Genesis'],
          ['Timestamp', new Date(block.timestamp).toLocaleString()],
          ['Difficulty', block.difficulty],
          ['Nonce', block.nonce.toLocaleString()],
          ['Transactions CID', block.transactionsCID],
          ['Homestead CID', block.homesteadCID],
          ['Frontier CID', block.frontierCID],
        ] as const).map(([label, value]) => (
          <div key={label} className="flex">
            <dt className="w-36 text-zinc-500 flex-shrink-0">{label}</dt>
            <dd className="text-zinc-300 break-all font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function ReceiptDetail({ receipt }: { receipt: TransactionReceipt }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="font-semibold mb-4">Transaction Receipt</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex"><dt className="w-32 text-zinc-500">CID</dt><dd className="text-zinc-300 break-all font-mono text-xs">{receipt.txCID}</dd></div>
        <div className="flex"><dt className="w-32 text-zinc-500">Block</dt><dd className="text-zinc-300">#{receipt.blockHeight} ({truncate(receipt.blockHash)})</dd></div>
        <div className="flex"><dt className="w-32 text-zinc-500">Status</dt><dd className={receipt.status === 'confirmed' ? 'text-emerald-400' : 'text-yellow-400'}>{receipt.status}</dd></div>
        <div className="flex"><dt className="w-32 text-zinc-500">Fee</dt><dd className="text-zinc-300">{receipt.fee.toLocaleString()}</dd></div>
        <div className="flex"><dt className="w-32 text-zinc-500">Sender</dt><dd className="text-zinc-300 break-all font-mono text-xs">{receipt.sender}</dd></div>
      </dl>
      {receipt.accountActions.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs text-zinc-500 mb-2">Account Actions</h4>
          {receipt.accountActions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm py-1">
              <span className="font-mono text-xs text-zinc-400">{truncate(a.owner)}</span>
              <ArrowRight size={12} className="text-zinc-600" />
              <span className={a.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {a.delta >= 0 ? '+' : ''}{a.delta.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Explorer() {
  const { connected, selectedChain } = useNode()
  const [blocks, setBlocks] = useState<BlockInfo[]>([])
  const [selectedBlock, setSelectedBlock] = useState<BlockInfo | null>(null)
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [maxHeight, setMaxHeight] = useState(0)
  const pageSize = 20

  const loadBlocks = useCallback(async () => {
    if (!connected) return
    try {
      const latest = await lattice.getLatestBlock(selectedChain)
      const height = latest.index
      setMaxHeight(height)
      const start = Math.max(0, height - page * pageSize - pageSize + 1)
      const end = Math.max(0, height - page * pageSize)
      const fetches: Promise<BlockInfo>[] = []
      for (let i = end; i >= start; i--) {
        fetches.push(lattice.getBlock(i, selectedChain))
      }
      const results = await Promise.all(fetches)
      setBlocks(results)
    } catch {}
  }, [connected, selectedChain, page])

  useEffect(() => { loadBlocks() }, [loadBlocks])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    const q = searchQuery.trim()
    // Try as block height/hash
    try {
      const block = await lattice.getBlock(q, selectedChain)
      setSelectedBlock(block)
      setReceipt(null)
      return
    } catch {}
    // Try as transaction CID
    try {
      const r = await lattice.getReceipt(q, selectedChain)
      setReceipt(r)
      setSelectedBlock(null)
      return
    } catch {}
  }

  if (!connected) {
    return <div className="p-6 text-zinc-500">Connect to a node to explore blocks.</div>
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Explorer</h1>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by block height, hash, or transaction CID..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium transition-colors"
        >
          Search
        </button>
      </div>

      {/* Detail view */}
      {selectedBlock && <div className="mb-6"><BlockDetail block={selectedBlock} onClose={() => setSelectedBlock(null)} /></div>}
      {receipt && <div className="mb-6"><ReceiptDetail receipt={receipt} /></div>}

      {/* Block list */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold">Recent Blocks</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * pageSize >= maxHeight}
              className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-zinc-500">Page {page + 1}</span>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
              <th className="text-left px-4 py-2">Height</th>
              <th className="text-left px-4 py-2">Hash</th>
              <th className="text-left px-4 py-2">Time</th>
              <th className="text-right px-4 py-2">Nonce</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map(b => (
              <tr
                key={b.hash}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                onClick={() => { setSelectedBlock(b); setReceipt(null) }}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Hash size={12} className="text-zinc-600" />
                    <span className="font-medium">{b.index.toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{truncate(b.hash, 24)}</td>
                <td className="px-4 py-2.5 text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} />
                    {new Date(b.timestamp).toLocaleTimeString()}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-400">{b.nonce.toLocaleString()}</td>
              </tr>
            ))}
            {blocks.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No blocks found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
