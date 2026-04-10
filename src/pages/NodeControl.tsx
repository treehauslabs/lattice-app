import { useState } from 'react'
import { Server, Pickaxe, Users, Wifi, Globe, Activity } from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { lattice } from '../api/client'
import type { ChainStatus } from '../api/types'

function MiningCard({ chain }: { chain: ChainStatus }) {
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      if (chain.mining) {
        await lattice.stopMining(chain.directory)
      } else {
        await lattice.startMining(chain.directory)
      }
    } catch {}
    setLoading(false)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pickaxe size={16} className={chain.mining ? 'text-emerald-400' : 'text-zinc-500'} />
          <span className="font-medium">{chain.directory}</span>
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            chain.mining
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
          } disabled:opacity-50`}
        >
          {loading ? '...' : chain.mining ? 'Stop' : 'Start'}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-zinc-500">Height</span>
          <div className="font-medium text-zinc-300">#{chain.height.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-zinc-500">Mempool</span>
          <div className="font-medium text-zinc-300">{chain.mempoolCount}</div>
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

export function NodeControl() {
  const { connected, chains, peers, genesisHash, error } = useNode()

  if (!connected) {
    return <div className="p-6 text-zinc-500">Connect to a node to manage it.</div>
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Node</h1>

      {/* Node info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Server size={16} className="text-lattice-400" />
          <span className="font-semibold">Node Info</span>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex">
            <span className="w-28 text-zinc-500">Genesis</span>
            <span className="font-mono text-xs text-zinc-400">{genesisHash}</span>
          </div>
          <div className="flex">
            <span className="w-28 text-zinc-500">Chains</span>
            <span className="text-zinc-300">{chains.length}</span>
          </div>
          <div className="flex">
            <span className="w-28 text-zinc-500">Status</span>
            <span className="text-emerald-400">Running</span>
          </div>
        </div>
      </div>

      {/* Mining controls */}
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Pickaxe size={18} /> Mining
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {chains.map(c => <MiningCard key={c.directory} chain={c} />)}
      </div>

      {/* Peers */}
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Users size={18} /> Peers ({peers?.count ?? 0})
      </h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {peers && peers.peers.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
                <th className="text-left px-4 py-2">Public Key</th>
                <th className="text-left px-4 py-2">Host</th>
                <th className="text-right px-4 py-2">Port</th>
              </tr>
            </thead>
            <tbody>
              {peers.peers.map((p, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  <td className="px-4 py-2 font-mono text-xs text-zinc-400">{p.publicKey}</td>
                  <td className="px-4 py-2 text-zinc-300">{p.host}</td>
                  <td className="px-4 py-2 text-right text-zinc-400">{p.port}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-8 text-center text-zinc-500 text-sm">No peers connected</div>
        )}
      </div>
    </div>
  )
}
