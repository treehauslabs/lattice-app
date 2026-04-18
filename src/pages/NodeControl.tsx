import { useState } from 'react'
import { Server, Pickaxe, Users, X, AlertCircle } from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { useWallet } from '../hooks/useWallet'
import { lattice } from '../api/client'
import { publicKeyFromPrivate } from '../wallet/signer'
import { decryptPrivateKey } from '../wallet/keystore'
import type { ChainStatus } from '../api/types'

function UnlockMinerModal({
  chain, onClose, onUnlocked,
}: {
  chain: string
  onClose: () => void
  onUnlocked: (identity: { publicKey: string; privateKey: string }) => Promise<void>
}) {
  const { accounts, minerIndex, activeIndex } = useWallet()
  const initialIndex = minerIndex >= 0 ? minerIndex : activeIndex
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedAccount = accounts[selectedIndex]

  const handleStart = async () => {
    if (!selectedAccount) { setError('Select a wallet account'); return }
    if (!password) { setError('Password required'); return }
    setLoading(true)
    setError('')
    try {
      const privateKey = await decryptPrivateKey(selectedAccount.encrypted, password)
      const publicKey = publicKeyFromPrivate(privateKey)
      await onUnlocked({ publicKey, privateKey })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <h3 className="font-semibold">Start mining on {chain}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {accounts.length === 0 ? (
            <p className="text-sm text-zinc-400">Create a wallet account first — block rewards pay to a wallet address.</p>
          ) : (
            <>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Reward account</label>
                <select
                  value={selectedIndex}
                  onChange={e => setSelectedIndex(parseInt(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-lattice-500"
                >
                  {accounts.map((a, i) => (
                    <option key={a.publicKey} value={i}>
                      {a.name}{a.isMiner ? ' (Miner)' : ''} — {a.address.slice(0, 16)}...
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 block mb-1">Password</label>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  autoFocus
                  placeholder="Wallet password"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
                  onKeyDown={e => e.key === 'Enter' && handleStart()}
                />
              </div>
              {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
              <button
                onClick={handleStart}
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {loading ? 'Starting...' : 'Start mining'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MiningCard({ chain }: { chain: ChainStatus }) {
  const [loading, setLoading] = useState(false)
  const [showUnlock, setShowUnlock] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setError(null)
    if (chain.mining) {
      setLoading(true)
      try { await lattice.stopMining(chain.directory) }
      catch (e) { setError(e instanceof Error ? e.message : 'Stop failed') }
      setLoading(false)
      return
    }
    setShowUnlock(true)
  }

  const startWithIdentity = async (identity: { publicKey: string; privateKey: string }) => {
    setError(null)
    setLoading(true)
    try { await lattice.startMining(chain.directory, identity) }
    catch (e) { setError(e instanceof Error ? e.message : 'Start failed') }
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
          onClick={handleClick}
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
      {error && (
        <p className="mt-3 text-red-400 text-xs flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}
      {showUnlock && (
        <UnlockMinerModal
          chain={chain.directory}
          onClose={() => setShowUnlock(false)}
          onUnlocked={startWithIdentity}
        />
      )}
    </div>
  )
}

export function NodeControl() {
  const { connected, chains, peers, genesisHash } = useNode()

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
