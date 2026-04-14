import { useState, useEffect } from 'react'
import {
  Blocks, ArrowUpDown, Clock, TrendingUp, Layers, ChevronRight,
} from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { useWallet } from '../hooks/useWallet'
import { lattice } from '../api/client'
import type { BlockInfo, FeeEstimate, ChainSpec } from '../api/types'

export function Dashboard() {
  const { chains, peers, connected, selectedChain, setSelectedChain, error } = useNode()
  const { activeAccount } = useWallet()
  const [latestBlock, setLatestBlock] = useState<BlockInfo | null>(null)
  const [fee, setFee] = useState<FeeEstimate | null>(null)
  const [chainBalances, setChainBalances] = useState<Record<string, number>>({})
  const [spec, setSpec] = useState<ChainSpec | null>(null)

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
  const blockTime = latestBlock?.timestamp
    ? new Date(latestBlock.timestamp).toLocaleTimeString()
    : null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Hero banner */}
      <div className="bg-gradient-to-br from-lattice-900/40 via-zinc-900/80 to-zinc-900/80 rounded-2xl p-5 mb-6 border border-lattice-800/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-zinc-500">
                Block #{chain?.height.toLocaleString() ?? '0'}
                {chain?.mining && <span className="text-emerald-400 ml-2">Mining</span>}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500">Peers</div>
            <div className="text-lg font-bold">{peers?.count ?? 0}</div>
          </div>
        </div>

        {/* Inline stats row */}
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <ArrowUpDown size={11} />
            <span className="text-zinc-500">Mempool</span>
            <span className="font-medium text-zinc-300">{chain?.mempoolCount ?? 0}</span>
          </div>
          {blockTime && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Clock size={11} />
              <span className="text-zinc-500">Last block</span>
              <span className="font-medium text-zinc-300">{blockTime}</span>
            </div>
          )}
          {fee && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <TrendingUp size={11} />
              <span className="text-zinc-500">Fee</span>
              <span className="font-medium text-zinc-300">{fee.fee.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio card */}
      {activeAccount && (
        <div className="bg-zinc-900/80 rounded-2xl p-5 mb-6">
          <div className="text-xs text-zinc-500 mb-1">Total Balance</div>
          <div className="text-3xl font-bold mb-4">{totalBalance.toLocaleString()}</div>
          {chains.length > 1 && (
            <div className="flex gap-3 flex-wrap">
              {chains.map(c => (
                <div
                  key={c.directory}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    c.directory === selectedChain
                      ? 'bg-lattice-600/10 text-lattice-400'
                      : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
                  }`}
                  onClick={() => setSelectedChain(c.directory)}
                >
                  <span className="font-medium">{c.directory}</span>
                  <span className="text-zinc-500">{(chainBalances[c.directory] ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chain table */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
          <Layers size={14} /> Chains
        </h2>
        <div className="bg-zinc-900/80 rounded-xl overflow-hidden">
          {chains.map((c, i) => (
            <button
              key={c.directory}
              onClick={() => setSelectedChain(c.directory)}
              className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${
                i > 0 ? 'border-t border-zinc-800/50' : ''
              } ${c.directory === selectedChain ? 'bg-lattice-600/5' : 'hover:bg-zinc-800/30'}`}
            >
              <div className="flex items-center gap-3">
                {c.directory === selectedChain && (
                  <span className="w-1.5 h-1.5 rounded-full bg-lattice-500" />
                )}
                <span className="text-sm font-medium">{c.directory}</span>
                {c.mining && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-600/10 px-1.5 py-0.5 rounded">Mining</span>
                )}
                {c.syncing && (
                  <span className="text-[10px] text-yellow-400 bg-yellow-600/10 px-1.5 py-0.5 rounded">Syncing</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="tabular-nums">#{c.height.toLocaleString()}</span>
                <span className="tabular-nums">{c.mempoolCount} pending</span>
                {activeAccount && chainBalances[c.directory] !== undefined && (
                  <span className="text-zinc-300 font-medium tabular-nums">{chainBalances[c.directory].toLocaleString()}</span>
                )}
                <ChevronRight size={14} className="text-zinc-700" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chain config */}
      {spec && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">
            {spec.directory} Configuration
          </h2>
          <div className="bg-zinc-900/80 rounded-xl p-4">
            <div className="grid grid-cols-3 gap-4">
              <ConfigField label="Block Time" value={`${spec.targetBlockTime}s`} />
              <ConfigField label="Block Reward" value={currentReward(spec, chain?.height ?? 0).toLocaleString()} />
              <ConfigField label="Halving" value={`${spec.halvingInterval.toLocaleString()} blks`} />
              <ConfigField label="Max Txs/Block" value={spec.maxTransactionsPerBlock.toLocaleString()} />
              <ConfigField label="Max Block Size" value={formatBytes(spec.maxBlockSize)} />
              <ConfigField label="Max State Growth" value={spec.maxStateGrowth.toLocaleString()} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfigField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-zinc-500 mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-zinc-200">{value}</dd>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function currentReward(spec: ChainSpec, height: number): number {
  if (spec.halvingInterval === 0) return spec.initialReward
  const halvings = Math.floor(height / spec.halvingInterval)
  if (halvings >= 64) return 0
  return Math.floor(spec.initialReward / Math.pow(2, halvings))
}
