import { useState, useEffect } from 'react'
import { Plus, Key, Trash2, Copy, Send, Lock, Unlock, Eye, EyeOff, Download } from 'lucide-react'
import { useWallet } from '../hooks/useWallet'
import { useNode } from '../hooks/useNode'
import { lattice } from '../api/client'
import { submitTransfer } from '../wallet/transaction'
import type { BalanceResponse, NonceResponse } from '../api/types'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 text-zinc-500 hover:text-zinc-300"
      title="Copy"
    >
      {copied ? <span className="text-xs text-emerald-400">Copied</span> : <Copy size={12} />}
    </button>
  )
}

function CreateAccountModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, password: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await onCreate(name.trim(), password)
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-96" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Create Account</h3>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password (min 8 chars)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
          <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" placeholder="Confirm password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg text-sm hover:bg-zinc-800">Cancel</button>
            <button onClick={handleCreate} disabled={loading} className="flex-1 px-4 py-2 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium disabled:opacity-50">{loading ? 'Creating...' : 'Create'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImportAccountModal({ onClose, onImport }: { onClose: () => void; onImport: (name: string, key: string, password: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [password, setPassword] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleImport = async () => {
    if (!name.trim()) { setError('Name required'); return }
    if (!privateKey.match(/^[0-9a-fA-F]{64}$/)) { setError('Invalid private key (64 hex chars)'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await onImport(name.trim(), privateKey, password)
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-96" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Import Account</h3>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
          <div className="relative">
            <input value={privateKey} onChange={e => setPrivateKey(e.target.value)} type={showKey ? 'text' : 'password'} placeholder="Private key (64 hex chars)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:border-lattice-500" />
            <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Encryption password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg text-sm hover:bg-zinc-800">Cancel</button>
            <button onClick={handleImport} disabled={loading} className="flex-1 px-4 py-2 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium disabled:opacity-50">{loading ? 'Importing...' : 'Import'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SendModal({ onClose, address, chain }: { onClose: () => void; address: string; chain: string }) {
  const { unlock } = useWallet()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('100')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const wallet = useWallet()

  const handleSend = async () => {
    if (!to.trim() || !amount.trim()) { setError('Fill all fields'); return }
    const amt = parseInt(amount)
    const feeAmt = parseInt(fee)
    if (isNaN(amt) || amt <= 0) { setError('Invalid amount'); return }
    if (isNaN(feeAmt) || feeAmt < 0) { setError('Invalid fee'); return }

    setLoading(true)
    setError('')
    try {
      const privateKey = await unlock(password)
      const nonceResp = await lattice.getNonce(address, chain)
      const resp = await submitTransfer({
        chainPath: [chain],
        from: address,
        to: to.trim(),
        amount: amt,
        fee: feeAmt,
        nonce: nonceResp.nonce,
        signerPublicKey: wallet.activeAccount!.publicKey,
      }, privateKey, chain)
      if (resp.accepted) {
        setResult(resp.txCID)
      } else {
        setError(resp.error || 'Transaction rejected')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-[420px]" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Send on {chain}</h3>
        {result ? (
          <div>
            <p className="text-emerald-400 mb-2">Transaction submitted</p>
            <p className="text-xs font-mono text-zinc-400 break-all">{result}</p>
            <button onClick={onClose} className="mt-4 w-full px-4 py-2 bg-zinc-800 rounded-lg text-sm">Close</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Recipient Address</label>
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="Recipient address" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-lattice-500" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-zinc-500 block mb-1">Amount</label>
                <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
              </div>
              <div className="w-28">
                <label className="text-xs text-zinc-500 block mb-1">Fee</label>
                <input value={fee} onChange={e => setFee(e.target.value)} type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Password (to sign)</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Wallet password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg text-sm hover:bg-zinc-800">Cancel</button>
              <button onClick={handleSend} disabled={loading} className="flex-1 px-4 py-2 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium disabled:opacity-50">{loading ? 'Signing...' : 'Send'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function WalletPage() {
  const { accounts, activeAccount, activeIndex, setActiveIndex, createAccount, importAccount, deleteAccount } = useWallet()
  const { connected, selectedChain } = useNode()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [balances, setBalances] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!connected || accounts.length === 0) return
    const fetchBalances = async () => {
      const results: Record<string, number> = {}
      for (const acc of accounts) {
        try {
          const b = await lattice.getBalance(acc.address, selectedChain)
          results[acc.address] = b.balance
        } catch {
          results[acc.address] = 0
        }
      }
      setBalances(results)
    }
    fetchBalances()
    const interval = setInterval(fetchBalances, 10000)
    return () => clearInterval(interval)
  }, [connected, accounts, selectedChain])

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Wallet</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium transition-colors">
            <Plus size={14} /> Create
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 hover:bg-zinc-800 rounded-lg text-sm transition-colors">
            <Download size={14} /> Import
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <Key size={48} className="mx-auto text-zinc-700 mb-4" />
          <h2 className="text-lg font-semibold text-zinc-300 mb-2">No Accounts</h2>
          <p className="text-zinc-500 text-sm mb-4">Create or import a secp256k1 key pair to get started.</p>
          <p className="text-zinc-600 text-xs">Private keys are encrypted with AES-256-GCM and never leave your browser.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc, i) => (
            <div
              key={acc.publicKey}
              className={`bg-zinc-900 border rounded-lg p-4 transition-colors cursor-pointer ${
                i === activeIndex ? 'border-lattice-600/50 bg-lattice-600/5' : 'border-zinc-800 hover:border-zinc-700'
              }`}
              onClick={() => setActiveIndex(i)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{acc.name}</span>
                  {i === activeIndex && <span className="text-[10px] bg-lattice-600/20 text-lattice-400 px-1.5 py-0.5 rounded">Active</span>}
                </div>
                <div className="flex items-center gap-1">
                  {i === activeIndex && connected && (
                    <button onClick={e => { e.stopPropagation(); setShowSend(true) }} className="flex items-center gap-1 px-2 py-1 bg-lattice-600 hover:bg-lattice-700 rounded text-xs font-medium">
                      <Send size={10} /> Send
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); if (confirm('Delete this account? This cannot be undone.')) deleteAccount(i) }} className="p-1 text-zinc-600 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 w-16">Address</span>
                  <span className="font-mono text-zinc-400">{acc.address.slice(0, 32)}...</span>
                  <CopyButton text={acc.address} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 w-16">Public Key</span>
                  <span className="font-mono text-zinc-400">{acc.publicKey.slice(0, 32)}...</span>
                  <CopyButton text={acc.publicKey} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 w-16">Balance</span>
                  <span className="font-medium text-zinc-200">
                    {connected ? (balances[acc.address]?.toLocaleString() ?? '...') : 'Offline'}
                  </span>
                  <span className="text-zinc-600">on {selectedChain}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} onCreate={createAccount} />}
      {showImport && <ImportAccountModal onClose={() => setShowImport(false)} onImport={importAccount} />}
      {showSend && activeAccount && <SendModal onClose={() => setShowSend(false)} address={activeAccount.address} chain={selectedChain} />}
    </div>
  )
}
