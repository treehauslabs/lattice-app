import { useState } from 'react'
import { ArrowLeftRight, ArrowDown, Clock, Shield, AlertCircle } from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { useWallet } from '../hooks/useWallet'
import { lattice } from '../api/client'
import { buildSwap } from '../wallet/transaction'

type Tab = 'swap' | 'settle' | 'claim'

export function Trading() {
  const { connected, chains, selectedChain } = useNode()
  const { activeAccount, unlock, locked } = useWallet()
  const [tab, setTab] = useState<Tab>('swap')

  if (!connected) {
    return <div className="p-6 text-zinc-500">Connect to a node to trade.</div>
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Cross-Chain Trading</h1>

      {/* Protocol explanation */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Shield size={14} className="text-lattice-400" />
          Trustless Cross-Chain Swaps
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Value moves between chains through a three-phase protocol verified entirely by Merkle proofs.
          No bridges, no relayers, no trusted third parties. Funds are locked with a timelock —
          if the counterparty doesn't settle, you reclaim after expiry.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-lg border border-zinc-800 w-fit">
        {(['swap', 'settle', 'claim'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-lattice-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'swap' && <SwapForm chains={chains.map(c => c.directory)} />}
      {tab === 'settle' && <SettleForm chains={chains.map(c => c.directory)} />}
      {tab === 'claim' && <ClaimForm />}
    </div>
  )
}

function SwapForm({ chains }: { chains: string[] }) {
  const { activeAccount, unlock } = useWallet()
  const { selectedChain } = useNode()
  const [sourceChain, setSourceChain] = useState(selectedChain)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('100')
  const [timelock, setTimelock] = useState('1000')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const handleSwap = async () => {
    if (!activeAccount) { setError('No active wallet account'); return }
    if (!recipient.trim() || !amount.trim()) { setError('Fill all fields'); return }
    setLoading(true)
    setError('')
    try {
      const privateKey = await unlock(password)
      const nonceResp = await lattice.getNonce(activeAccount.address, sourceChain)
      const swapNonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      const signed = await buildSwap({
        chainPath: [sourceChain],
        from: activeAccount.address,
        recipient: recipient.trim(),
        amount: parseInt(amount),
        fee: parseInt(fee),
        nonce: nonceResp.nonce,
        swapNonce,
        timelock: parseInt(timelock),
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)

      const resp = await lattice.submitTransaction(signed, sourceChain)
      if (resp.accepted) {
        setResult(resp.txCID)
      } else {
        setError(resp.error || 'Transaction rejected')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
    setLoading(false)
  }

  if (result) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-emerald-400 font-semibold mb-2">Swap Initiated</h3>
        <p className="text-xs text-zinc-400 mb-2">Your funds are locked on {sourceChain}. Share the swap details with the counterparty so they can submit a matching swap on the destination chain.</p>
        <div className="bg-zinc-800 rounded p-3 font-mono text-xs text-zinc-300 break-all">{result}</div>
        <button onClick={() => { setResult(null); setRecipient(''); setAmount('') }} className="mt-4 px-4 py-2 border border-zinc-700 rounded-lg text-sm hover:bg-zinc-800">New Swap</button>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <div>
        <label className="text-xs text-zinc-500 block mb-1">Source Chain</label>
        <select value={sourceChain} onChange={e => setSourceChain(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500">
          {chains.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-center">
        <ArrowDown size={20} className="text-zinc-600" />
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">Recipient Address (on destination chain)</label>
        <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Recipient address" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-lattice-500" />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-zinc-500 block mb-1">Amount</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
        </div>
        <div className="w-28">
          <label className="text-xs text-zinc-500 block mb-1">Fee</label>
          <input value={fee} onChange={e => setFee(e.target.value)} type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
        </div>
        <div className="w-28">
          <label className="text-xs text-zinc-500 block mb-1 flex items-center gap-1"><Clock size={10} /> Timelock</label>
          <input value={timelock} onChange={e => setTimelock(e.target.value)} type="number" placeholder="blocks" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
        </div>
      </div>

      <div>
        <label className="text-xs text-zinc-500 block mb-1">Password (to sign)</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Wallet password" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500" />
      </div>

      {!activeAccount && (
        <div className="flex items-center gap-2 text-yellow-400 text-xs">
          <AlertCircle size={14} /> Create or select a wallet account first
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={handleSwap}
        disabled={loading || !activeAccount}
        className="w-full px-4 py-2.5 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <ArrowLeftRight size={14} />
        {loading ? 'Signing...' : 'Initiate Swap'}
      </button>
    </div>
  )
}

function SettleForm({ chains }: { chains: string[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h3 className="font-semibold mb-3">Settle Cross-Chain Swap</h3>
      <p className="text-sm text-zinc-400 mb-4">
        After both parties have submitted matching swaps on their respective chains,
        submit a settle action referencing both swap keys.
      </p>
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 block mb-1">Chain A</label>
            <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500">
              {chains.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-zinc-500 block mb-1">Chain B</label>
            <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lattice-500">
              {chains.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Swap Key A</label>
          <input placeholder="Swap key from Chain A" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-lattice-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Swap Key B</label>
          <input placeholder="Swap key from Chain B" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-lattice-500" />
        </div>
        <button className="w-full px-4 py-2.5 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
          <Shield size={14} /> Submit Settlement
        </button>
      </div>
    </div>
  )
}

function ClaimForm() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <h3 className="font-semibold mb-3">Claim Swapped Funds</h3>
      <p className="text-sm text-zinc-400 mb-4">
        After settlement is confirmed, claim the locked funds. If the timelock has
        expired without settlement, you can submit a refund claim instead.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Swap Key</label>
          <input placeholder="Swap key to claim" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-lattice-500" />
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="radio" name="claimType" value="claim" defaultChecked className="accent-lattice-500" />
            Claim (settlement exists)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="radio" name="claimType" value="refund" className="accent-lattice-500" />
            Refund (timelock expired)
          </label>
        </div>
        <button className="w-full px-4 py-2.5 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium">
          Submit Claim
        </button>
      </div>
    </div>
  )
}
