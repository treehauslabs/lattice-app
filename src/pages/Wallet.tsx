import { useState, useEffect } from 'react'
import { Plus, Trash2, Copy, Send, Eye, EyeOff, Download, ChevronDown, ChevronUp, X, AlertCircle, CheckCircle2, Pickaxe, Server } from 'lucide-react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '../hooks/useWallet'
import { useNode } from '../hooks/useNode'
import { lattice } from '../api/client'
import { submitTransfer } from '../wallet/transaction'
import { parseIdentityFile, type ParsedIdentity } from '../wallet/identityFile'
import { readNodeIdentity } from '../tauri/bootstrap'
import { computeAddress } from '../wallet/signer'
import { qk, useFeeEstimate } from '../hooks/queries'
import type { ChainStatus } from '../api/types'
import type { StoredAccount } from '../wallet/keystore'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
      title="Copy"
    >
      {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  )
}

// ============================================================
// Modals
// ============================================================

function Modal({ onClose, children, title }: { onClose: () => void; children: React.ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
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
    try { await onCreate(name.trim(), password); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  return (
    <Modal onClose={onClose} title="Create Account">
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" autoFocus />
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password (min 8 chars)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" />
        <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" placeholder="Confirm password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 border border-zinc-700 rounded-xl text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={loading} className="flex-1 py-3 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">{loading ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </Modal>
  )
}

function CreateMinerAccountModal({
  onClose, onCreate, onImport,
}: {
  onClose: () => void
  onCreate: (password: string) => Promise<void>
  onImport: (name: string, key: string, password: string, opts?: { isMiner?: boolean }) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nodePassword, setNodePassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nodeIdentityJson, setNodeIdentityJson] = useState<string | null>(null)
  const [detected, setDetected] = useState<{ address: string; encrypted: boolean } | null>(null)
  const [useNodeKey, setUseNodeKey] = useState(true)

  useEffect(() => {
    let cancelled = false
    readNodeIdentity().then(json => {
      if (cancelled || !json) return
      try {
        const parsed = JSON.parse(json)
        if (!parsed.publicKey) return
        const address = computeAddress(parsed.publicKey)
        const encrypted = !parsed.privateKey && !!parsed.encryptedPrivateKey
        setNodeIdentityJson(json)
        setDetected({ address, encrypted })
      } catch { /* ignore unparseable identity.json */ }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    try {
      if (useNodeKey && nodeIdentityJson) {
        let parsed: ParsedIdentity
        try {
          parsed = await parseIdentityFile(nodeIdentityJson, nodePassword || undefined)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to parse node identity')
          setLoading(false)
          return
        }
        await onImport('Miner', parsed.privateKey, password, { isMiner: true })
      } else {
        await onCreate(password)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
    setLoading(false)
  }

  return (
    <Modal onClose={onClose} title="Set up Miner account">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Block rewards from mining will be paid to this account. Keys are encrypted with your password.
        </p>
        {detected && (
          <div className="bg-emerald-600/10 border border-emerald-700/30 rounded-lg p-3 text-xs space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={useNodeKey} onChange={e => setUseNodeKey(e.target.checked)} className="mt-0.5 accent-emerald-500" />
              <div className="flex-1">
                <div className="font-semibold text-emerald-300">Use node's existing mining key</div>
                <div className="text-zinc-400 mt-0.5">Rewards already earned by the node will appear here.</div>
                <div className="font-mono text-[10px] text-zinc-500 mt-1 break-all">{detected.address}</div>
              </div>
            </label>
          </div>
        )}
        {detected && useNodeKey && detected.encrypted && (
          <input
            value={nodePassword}
            onChange={e => setNodePassword(e.target.value)}
            type="password"
            placeholder="Node identity password"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
          />
        )}
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Wallet password (min 8 chars)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" autoFocus />
        <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" placeholder="Confirm password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 border border-zinc-700 rounded-xl text-sm hover:bg-zinc-800 transition-colors">Skip</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
            {loading ? 'Working...' : detected && useNodeKey ? 'Import Miner' : 'Create Miner'}
          </button>
        </div>
      </div>
    </Modal>
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
    try { await onImport(name.trim(), privateKey, password); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }

  return (
    <Modal onClose={onClose} title="Import Account">
      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" autoFocus />
        <div className="relative">
          <input value={privateKey} onChange={e => setPrivateKey(e.target.value)} type={showKey ? 'text' : 'password'} placeholder="Private key (64 hex chars)" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 pr-10 text-sm font-mono focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" />
          <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Encryption password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" onKeyDown={e => e.key === 'Enter' && handleImport()} />
        {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 border border-zinc-700 rounded-xl text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
          <button onClick={handleImport} disabled={loading} className="flex-1 py-3 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">{loading ? 'Importing...' : 'Import'}</button>
        </div>
      </div>
    </Modal>
  )
}

function ImportNodeIdentityModal({
  onClose, onImport,
}: {
  onClose: () => void
  onImport: (name: string, key: string, password: string, opts?: { isMiner?: boolean }) => Promise<void>
}) {
  const [name, setName] = useState('Node Miner')
  const [identityJson, setIdentityJson] = useState('')
  const [nodePassword, setNodePassword] = useState('')
  const [password, setPassword] = useState('')
  const [asMiner, setAsMiner] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleImport = async () => {
    if (!name.trim()) { setError('Name required'); return }
    if (!identityJson.trim()) { setError('Paste identity.json contents'); return }
    if (password.length < 8) { setError('Wallet password must be at least 8 characters'); return }
    setLoading(true)
    setError('')
    try {
      const parsed = await parseIdentityFile(identityJson, nodePassword || undefined)
      await onImport(name.trim(), parsed.privateKey, password, { isMiner: asMiner })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
    setLoading(false)
  }

  return (
    <Modal onClose={onClose} title="Import Node Identity">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Paste the contents of the node's <span className="font-mono text-zinc-400">identity.json</span> (from the node's data directory). This is the key the CLI uses to sign coinbase rewards.
        </p>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Account name"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
        />
        <textarea
          value={identityJson}
          onChange={e => setIdentityJson(e.target.value)}
          placeholder='{"publicKey":"...","privateKey":"..."}'
          rows={5}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-xs font-mono focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600 resize-none"
        />
        <input
          value={nodePassword}
          onChange={e => setNodePassword(e.target.value)}
          type="password"
          placeholder="Node identity password (only if encrypted)"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          placeholder="Wallet encryption password"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
          onKeyDown={e => e.key === 'Enter' && handleImport()}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-400 pt-1">
          <input type="checkbox" checked={asMiner} onChange={e => setAsMiner(e.target.checked)} className="accent-emerald-500" />
          Mark as Miner (default reward recipient)
        </label>
        {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 border border-zinc-700 rounded-xl text-sm hover:bg-zinc-800 transition-colors">Cancel</button>
          <button onClick={handleImport} disabled={loading} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">{loading ? 'Importing...' : 'Import'}</button>
        </div>
      </div>
    </Modal>
  )
}

function SendModal({ onClose, address, chain }: { onClose: () => void; address: string; chain: string }) {
  const { unlock, activeAccount } = useWallet()
  const queryClient = useQueryClient()
  const feeEstimate = useFeeEstimate(5, chain)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('100')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    if (feeEstimate.data) setFee(String(feeEstimate.data.fee))
  }, [feeEstimate.data])

  const handleSend = async () => {
    if (!to.trim() || !amount.trim()) { setError('Fill all fields'); return }
    const amt = parseInt(amount)
    const feeAmt = parseInt(fee)
    if (isNaN(amt) || amt <= 0) { setError('Invalid amount'); return }
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
        signerPublicKey: activeAccount!.publicKey,
      }, privateKey, chain)
      if (resp.accepted) {
        queryClient.invalidateQueries({ queryKey: qk.mempool(chain) })
        queryClient.invalidateQueries({ queryKey: qk.nonce(address, chain) })
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
    <Modal onClose={onClose} title={`Send on ${chain}`}>
      {result ? (
        <div className="text-center py-4">
          <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-emerald-400 font-semibold mb-2">Transaction Sent</p>
          <p className="text-xs font-mono text-zinc-500 break-all">{result}</p>
          <button onClick={onClose} className="mt-5 w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm transition-colors">Done</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Recipient</label>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="Address" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" autoFocus />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-zinc-500 block mb-1">Amount</label>
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" />
            </div>
            <div className="w-24">
              <label className="text-[11px] text-zinc-500 block mb-1">Fee</label>
              <input value={fee} onChange={e => setFee(e.target.value)} type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Wallet password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600" onKeyDown={e => e.key === 'Enter' && handleSend()} />
          </div>
          {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
          <button onClick={handleSend} disabled={loading} className="w-full py-3.5 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">{loading ? 'Sending...' : 'Send'}</button>
        </div>
      )}
    </Modal>
  )
}

// ============================================================
// Main Page
// ============================================================

export function WalletPage() {
  const { accounts, activeAccount, activeIndex, setActiveIndex, createAccount, createMinerAccount, importAccount, deleteAccount, minerIndex } = useWallet()
  const { connected, selectedChain, chains } = useNode()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showImportNode, setShowImportNode] = useState(false)
  const [showMinerSetup, setShowMinerSetup] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [expandedAccount, setExpandedAccount] = useState<number | null>(null)

  useEffect(() => {
    if (accounts.length === 0 && minerIndex < 0) setShowMinerSetup(true)
  }, [accounts.length, minerIndex])

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Wallet</h1>
        <div className="flex gap-2">
          {minerIndex < 0 && (
            <button onClick={() => setShowMinerSetup(true)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold transition-colors">
              <Pickaxe size={14} /> Miner
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-xs font-semibold transition-colors">
            <Plus size={14} /> Create
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-medium transition-colors">
            <Download size={14} /> Import
          </button>
          <button onClick={() => setShowImportNode(true)} className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-medium transition-colors" title="Import node identity.json">
            <Server size={14} /> Node Key
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 flex items-center justify-center mx-auto mb-4">
            <Pickaxe size={28} className="text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-300 mb-2">Start with a Miner account</h2>
          <p className="text-zinc-500 text-sm mb-1">A default Miner keypair receives your block rewards.</p>
          <p className="text-zinc-600 text-xs mb-6">Keys are encrypted with AES-256-GCM and never leave your browser.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => setShowMinerSetup(true)} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition-colors">
              <Pickaxe size={16} /> Create Miner
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-6 py-3 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-sm font-semibold transition-colors">
              <Plus size={16} /> New Account
            </button>
            <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors">
              <Download size={16} /> Import Key
            </button>
            <button onClick={() => setShowImportNode(true)} className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors">
              <Server size={16} /> Node Key
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc, i) => (
            <AccountCard
              key={acc.publicKey}
              account={acc}
              chains={chains}
              connected={connected}
              selectedChain={selectedChain}
              isActive={i === activeIndex}
              isExpanded={expandedAccount === i}
              onToggle={() => { setActiveIndex(i); setExpandedAccount(expandedAccount === i ? null : i) }}
              onSend={() => setShowSend(true)}
              onDelete={() => { if (confirm('Delete this account? This cannot be undone.')) deleteAccount(i) }}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} onCreate={createAccount} />}
      {showImport && <ImportAccountModal onClose={() => setShowImport(false)} onImport={importAccount} />}
      {showImportNode && <ImportNodeIdentityModal onClose={() => setShowImportNode(false)} onImport={importAccount} />}
      {showMinerSetup && <CreateMinerAccountModal onClose={() => setShowMinerSetup(false)} onCreate={createMinerAccount} onImport={importAccount} />}
      {showSend && activeAccount && <SendModal onClose={() => setShowSend(false)} address={activeAccount.address} chain={selectedChain} />}
    </div>
  )
}

function AccountCard({
  account,
  chains,
  connected,
  selectedChain,
  isActive,
  isExpanded,
  onToggle,
  onSend,
  onDelete,
}: {
  account: StoredAccount
  chains: ChainStatus[]
  connected: boolean
  selectedChain: string
  isActive: boolean
  isExpanded: boolean
  onToggle: () => void
  onSend: () => void
  onDelete: () => void
}) {
  const balanceQueries = useQueries({
    queries: chains.map(c => ({
      queryKey: qk.balance(account.address, c.directory),
      queryFn: async () => (await lattice.getBalance(account.address, c.directory)).balance,
      enabled: connected && !!account.address,
      staleTime: Infinity,
    })),
  })

  const balancesByChain: Record<string, number> = {}
  chains.forEach((c, idx) => {
    balancesByChain[c.directory] = balanceQueries[idx]?.data ?? 0
  })
  const totalBalance = Object.values(balancesByChain).reduce((a, b) => a + b, 0)

  return (
    <div
      className={`bg-zinc-900/80 rounded-xl overflow-hidden transition-colors ${
        isActive ? 'ring-1 ring-lattice-600/30' : ''
      }`}
    >
      <button onClick={onToggle} className="w-full text-left px-4 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm">{account.name}</span>
            {account.isMiner && (
              <span className="text-[10px] bg-emerald-600/15 text-emerald-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Pickaxe size={9} /> Miner
              </span>
            )}
            {isActive && <span className="text-[10px] bg-lattice-600/15 text-lattice-400 px-1.5 py-0.5 rounded">Active</span>}
          </div>
          <div className="text-xs text-zinc-500 font-mono">{account.address.slice(0, 20)}...</div>
        </div>
        <div className="text-right flex items-center gap-3">
          {connected && (
            <div>
              <div className="text-lg font-bold tabular-nums">{totalBalance.toLocaleString()}</div>
              <div className="text-[11px] text-zinc-500">across {chains.length} chains</div>
            </div>
          )}
          {isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {connected && chains.length > 0 && (
            <div className="bg-zinc-800/40 rounded-lg divide-y divide-zinc-800/50">
              {chains.map(c => (
                <div key={c.directory} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className={c.directory === selectedChain ? 'text-lattice-400 font-medium' : 'text-zinc-400'}>
                    {c.directory}
                  </span>
                  <span className="font-medium tabular-nums">{(balancesByChain[c.directory] ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-14">Address</span>
              <span className="font-mono text-zinc-400 break-all flex-1">{account.address}</span>
              <CopyButton text={account.address} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-14">Key</span>
              <span className="font-mono text-zinc-400 break-all flex-1">{account.publicKey}</span>
              <CopyButton text={account.publicKey} />
            </div>
          </div>

          <div className="flex gap-2">
            {connected && (
              <button
                onClick={e => { e.stopPropagation(); onSend() }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-xs font-semibold transition-colors"
              >
                <Send size={12} /> Send
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-red-600/10 hover:text-red-400 rounded-xl text-xs transition-colors text-zinc-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
