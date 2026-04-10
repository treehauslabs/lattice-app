import { useState, useEffect } from 'react'
import { Blocks, Pickaxe, Users, ArrowUpDown, Clock, TrendingUp } from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { lattice } from '../api/client'
import type { BlockInfo, FeeEstimate } from '../api/types'

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Blocks; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
        <Icon size={14} />
        {label}
      </div>
      <div className="text-xl font-bold text-zinc-100">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  )
}

export function Dashboard() {
  const { chains, peers, connected, selectedChain, error } = useNode()
  const [latestBlock, setLatestBlock] = useState<BlockInfo | null>(null)
  const [fee, setFee] = useState<FeeEstimate | null>(null)

  const chain = chains.find(c => c.directory === selectedChain)

  useEffect(() => {
    if (!connected) return
    lattice.getLatestBlock(selectedChain).then(setLatestBlock).catch(() => {})
    lattice.getFeeEstimate(5, selectedChain).then(setFee).catch(() => {})
  }, [connected, selectedChain, chain?.height])

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-6xl mb-4 text-zinc-700">&#x2B21;</div>
          <h2 className="text-xl font-bold text-zinc-300 mb-2">No Node Connected</h2>
          <p className="text-zinc-500 text-sm max-w-sm">
            Start a Lattice node with <code className="text-lattice-400">--rpc-port 8080</code> and this
            app will connect automatically.
          </p>
          {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        </div>
      </div>
    )
  }

  const blockTime = latestBlock?.timestamp
    ? new Date(latestBlock.timestamp).toLocaleTimeString()
    : '--'

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        <StatCard
          icon={Blocks}
          label="Block Height"
          value={chain ? `#${chain.height.toLocaleString()}` : '--'}
          sub={`Tip: ${chain?.tip.slice(0, 16)}...`}
        />
        <StatCard
          icon={Pickaxe}
          label="Mining"
          value={chain?.mining ? 'Active' : 'Idle'}
          sub={chain?.mining ? `on ${selectedChain}` : undefined}
        />
        <StatCard
          icon={Users}
          label="Peers"
          value={String(peers?.count ?? 0)}
          sub="connected"
        />
        <StatCard
          icon={ArrowUpDown}
          label="Mempool"
          value={String(chain?.mempoolCount ?? 0)}
          sub="pending transactions"
        />
        <StatCard
          icon={Clock}
          label="Last Block"
          value={blockTime}
          sub={latestBlock ? `Difficulty: ${latestBlock.difficulty.slice(0, 12)}...` : undefined}
        />
        <StatCard
          icon={TrendingUp}
          label="Fee Estimate"
          value={fee ? `${fee.fee.toLocaleString()} sat` : '--'}
          sub={fee ? `${fee.target}-block target` : undefined}
        />
      </div>

      {/* Chain overview */}
      <h2 className="text-lg font-semibold mb-3">Chain Hierarchy</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
              <th className="text-left px-4 py-2">Chain</th>
              <th className="text-right px-4 py-2">Height</th>
              <th className="text-right px-4 py-2">Mempool</th>
              <th className="text-center px-4 py-2">Mining</th>
              <th className="text-center px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {chains.map(c => (
              <tr
                key={c.directory}
                className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors ${
                  c.directory === selectedChain ? 'bg-lattice-600/5' : ''
                }`}
                onClick={() => {}}
              >
                <td className="px-4 py-2.5 font-medium">{c.directory}</td>
                <td className="px-4 py-2.5 text-right text-zinc-400">#{c.height.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-zinc-400">{c.mempoolCount}</td>
                <td className="px-4 py-2.5 text-center">
                  {c.mining ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                      <Pickaxe size={12} /> Active
                    </span>
                  ) : (
                    <span className="text-zinc-500 text-xs">Idle</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {c.syncing ? (
                    <span className="text-yellow-400 text-xs">Syncing</span>
                  ) : (
                    <span className="text-emerald-400 text-xs">Synced</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
