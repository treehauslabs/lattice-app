import { useState, useEffect } from 'react'
import { Server, Pickaxe, Users, Settings2 } from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { lattice } from '../api/client'
import type { ChainStatus, ChainSpec } from '../api/types'

function MiningCard({ chain }: { chain: ChainStatus }) {
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      if (chain.mining) await lattice.stopMining(chain.directory)
      else await lattice.startMining(chain.directory)
    } catch {}
    setLoading(false)
  }

  return (
    <div className="bg-zinc-900/80 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pickaxe size={14} className={chain.mining ? 'text-emerald-400' : 'text-zinc-600'} />
          <span className="text-sm font-medium">{chain.directory}</span>
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            chain.mining
              ? 'bg-red-600/15 text-red-400 hover:bg-red-600/25'
              : 'bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25'
          } disabled:opacity-50`}
        >
          {loading ? '...' : chain.mining ? 'Stop' : 'Start'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-zinc-500">Height</span>
          <div className="font-medium text-zinc-300 tabular-nums">#{chain.height.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-zinc-500">Mempool</span>
          <div className="font-medium text-zinc-300 tabular-nums">{chain.mempoolCount}</div>
        </div>
        <div>
          <span className="text-zinc-500">Status</span>
          <div className={`font-medium ${chain.syncing ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {chain.syncing ? 'Syncing' : 'Synced'}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function NodeControl() {
  const { connected, chains, peers, genesisHash } = useNode()
  const [specs, setSpecs] = useState<Record<string, ChainSpec>>({})

  useEffect(() => {
    if (!connected) return
    const fetchSpecs = async () => {
      const results: Record<string, ChainSpec> = {}
      for (const c of chains) {
        try { results[c.directory] = await lattice.getChainSpec(c.directory) } catch {}
      }
      setSpecs(results)
    }
    fetchSpecs()
  }, [connected, chains.length])

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-4">
            <Server size={28} className="text-zinc-700" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-200 mb-2">Node Control</h2>
          <p className="text-zinc-500 text-sm">Connect to a node to manage it.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Node</h1>

      {/* Node info */}
      <div className="bg-zinc-900/80 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Server size={16} className="text-lattice-400" />
          <span className="font-semibold text-sm">Node Info</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex">
            <span className="w-24 text-zinc-500 text-xs">Genesis</span>
            <span className="font-mono text-xs text-zinc-400 break-all">{genesisHash}</span>
          </div>
          <div className="flex">
            <span className="w-24 text-zinc-500 text-xs">Chains</span>
            <span className="text-zinc-300">{chains.length}</span>
          </div>
          <div className="flex">
            <span className="w-24 text-zinc-500 text-xs">Status</span>
            <span className="text-emerald-400 text-sm">Running</span>
          </div>
        </div>
      </div>

      {/* Mining */}
      <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
        <Pickaxe size={14} /> Mining
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {chains.map(c => <MiningCard key={c.directory} chain={c} />)}
      </div>

      {/* Chain Specs */}
      {Object.keys(specs).length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
            <Settings2 size={14} /> Chain Specifications
          </h2>
          <div className="bg-zinc-900/80 rounded-2xl overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60 text-zinc-500 text-xs">
                  <th className="text-left px-4 py-3">Parameter</th>
                  {chains.map(c => (
                    <th key={c.directory} className="text-right px-4 py-3">{c.directory}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Block Time', (s: ChainSpec) => `${s.targetBlockTime}s`],
                  ['Initial Reward', (s: ChainSpec) => s.initialReward.toLocaleString()],
                  ['Halving', (s: ChainSpec) => `${s.halvingInterval.toLocaleString()} blks`],
                  ['Max Txs/Block', (s: ChainSpec) => s.maxTransactionsPerBlock.toLocaleString()],
                  ['Max Block Size', (s: ChainSpec) => formatBytes(s.maxBlockSize)],
                  ['Max State Growth', (s: ChainSpec) => s.maxStateGrowth.toLocaleString()],
                  ['Premine Block', (s: ChainSpec) => s.premine > 0 ? `#${s.premine}` : 'None'],
                  ['Premine Amount', (s: ChainSpec) => s.premineAmount > 0 ? s.premineAmount.toLocaleString() : 'None'],
                ] as [string, (s: ChainSpec) => string][]).map(([label, fmt]) => (
                  <tr key={label} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors">
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{label}</td>
                    {chains.map(c => (
                      <td key={c.directory} className="px-4 py-2.5 text-right text-zinc-200 font-medium text-xs tabular-nums">
                        {specs[c.directory] ? fmt(specs[c.directory]) : '...'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Peers */}
      <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
        <Users size={14} /> Peers ({peers?.count ?? 0})
      </h2>
      <div className="bg-zinc-900/80 rounded-2xl overflow-hidden">
        {peers && peers.peers.length > 0 ? (
          <div className="divide-y divide-zinc-800/40">
            {peers.peers.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <span className="font-mono text-xs text-zinc-400">{p.publicKey.slice(0, 32)}...</span>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{p.host}</span>
                  <span className="tabular-nums">{p.port}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-zinc-600 text-sm">No peers connected</div>
        )}
      </div>
    </div>
  )
}
