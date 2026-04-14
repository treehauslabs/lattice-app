import { useState, useEffect, useCallback } from 'react'
import {
  ArrowDownUp, Copy, Check, Loader2, CheckCircle2,
  Clock, AlertCircle, X, RefreshCw, ChevronRight,
  ShoppingCart, Tag, Wallet,
} from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { useWallet } from '../hooks/useWallet'
import { lattice } from '../api/client'
import { buildDeposit, buildReceipt, buildWithdrawal } from '../wallet/transaction'
import type { DepositEntry } from '../api/types'

// ============================================================
// Main Page
// ============================================================

export function Trading() {
  const { connected, chains, selectedChain } = useNode()
  const { activeAccount } = useWallet()
  const [tab, setTab] = useState<'trade' | 'orders'>('trade')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [fillDeposit, setFillDeposit] = useState<DepositEntry | null>(null)
  const [showSellConfirm, setShowSellConfirm] = useState<{ amount: number; fee: number } | null>(null)

  const chainDirs = chains.map(c => c.directory)
  const nexus = chainDirs.find(c => c.toLowerCase() === 'nexus') ?? chainDirs[0] ?? ''
  const childChains = chainDirs.filter(c => c !== nexus)
  const activeChild = childChains.includes(selectedChain) ? selectedChain : childChains[0] ?? ''

  const refreshBalances = useCallback(async () => {
    if (!connected || !activeAccount) return
    const results: Record<string, number> = {}
    for (const c of chains) {
      try {
        const b = await lattice.getBalance(activeAccount.address, c.directory)
        results[c.directory] = b.balance
      } catch { results[c.directory] = 0 }
    }
    setBalances(results)
  }, [connected, activeAccount?.address, chains.length])

  useEffect(() => {
    refreshBalances()
    const iv = setInterval(refreshBalances, 8000)
    return () => clearInterval(iv)
  }, [refreshBalances])

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <ArrowDownUp size={48} className="mx-auto text-zinc-700 mb-4" />
          <h2 className="text-xl font-bold text-zinc-300 mb-2">Exchange</h2>
          <p className="text-zinc-500 text-sm max-w-xs">
            Connect to a node to start trading across chains.
          </p>
        </div>
      </div>
    )
  }

  const nexusBalance = balances[nexus] ?? 0
  const childBalance = balances[activeChild] ?? 0

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Exchange</h1>
        <div className="flex gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
          {(['trade', 'orders'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === t ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'trade' ? 'Trade' : 'Orders'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'trade' ? (
        <div className="space-y-4">
          {/* Balance card */}
          {activeAccount ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
                <Wallet size={12} />
                <span>Your Balances</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-zinc-500">{nexus}</div>
                  <div className="text-xl font-bold">{nexusBalance.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500">{activeChild}</div>
                  <div className="text-xl font-bold">{childBalance.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <p className="text-sm text-zinc-500">Create a wallet to start trading</p>
            </div>
          )}

          {/* Buy / Sell toggle */}
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setSide('buy')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                side === 'buy'
                  ? 'bg-emerald-600/15 text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Buy {activeChild}
            </button>
            <button
              onClick={() => setSide('sell')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                side === 'sell'
                  ? 'bg-red-600/10 text-red-400 border-b-2 border-red-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Sell {activeChild}
            </button>
          </div>

          {/* Content based on side */}
          {side === 'buy' ? (
            <BuyView
              chain={activeChild}
              nexusBalance={nexusBalance}
              onFill={setFillDeposit}
              hasWallet={!!activeAccount}
            />
          ) : (
            <SellView
              chain={activeChild}
              nexus={nexus}
              childBalance={childBalance}
              hasWallet={!!activeAccount}
              onConfirm={setShowSellConfirm}
            />
          )}
        </div>
      ) : (
        <MyOrders childChains={childChains} nexus={nexus} />
      )}

      {/* Fill order modal */}
      {fillDeposit && (
        <FillOrderModal
          deposit={fillDeposit}
          chain={activeChild}
          nexus={nexus}
          nexusBalance={nexusBalance}
          onClose={() => setFillDeposit(null)}
          onComplete={() => { setFillDeposit(null); refreshBalances() }}
        />
      )}

      {/* Create offer modal */}
      {showSellConfirm && (
        <CreateOfferModal
          amount={showSellConfirm.amount}
          fee={showSellConfirm.fee}
          chain={activeChild}
          nexus={nexus}
          onClose={() => setShowSellConfirm(null)}
          onComplete={() => { setShowSellConfirm(null); refreshBalances() }}
        />
      )}
    </div>
  )
}

// ============================================================
// Buy View — Order Book
// ============================================================

function BuyView({ chain, nexusBalance, onFill, hasWallet }: {
  chain: string; nexusBalance: number; onFill: (d: DepositEntry) => void; hasWallet: boolean
}) {
  const [deposits, setDeposits] = useState<DepositEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDeposits = useCallback(async () => {
    try {
      const resp = await lattice.listDeposits(chain)
      const sorted = [...resp.deposits].sort((a, b) => a.amountDemanded - b.amountDemanded)
      setDeposits(sorted)
    } catch { setDeposits([]) }
    setLoading(false)
  }, [chain])

  useEffect(() => {
    setLoading(true)
    fetchDeposits()
    const iv = setInterval(fetchDeposits, 10000)
    return () => clearInterval(iv)
  }, [fetchDeposits])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ShoppingCart size={14} className="text-zinc-400" />
          <span className="text-sm font-medium">Available Orders</span>
          <span className="text-xs text-zinc-500">({deposits.length})</span>
        </div>
        <button onClick={fetchDeposits} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && deposits.length === 0 ? (
        <div className="p-8 text-center">
          <Loader2 size={20} className="mx-auto text-zinc-600 animate-spin mb-2" />
          <p className="text-xs text-zinc-600">Loading orders...</p>
        </div>
      ) : deposits.length === 0 ? (
        <div className="p-8 text-center">
          <Tag size={20} className="mx-auto text-zinc-700 mb-2" />
          <p className="text-sm text-zinc-500">No orders available</p>
          <p className="text-xs text-zinc-600 mt-1">Offers to sell {chain} tokens will appear here</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/50">
          {deposits.map((d, i) => {
            const canAfford = nexusBalance >= d.amountDemanded
            return (
              <button
                key={`${d.nonce}-${i}`}
                onClick={() => hasWallet && canAfford && onFill(d)}
                disabled={!hasWallet || !canAfford}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <div className="text-left">
                  <div className="text-sm font-semibold">{d.amountDemanded.toLocaleString()} <span className="text-zinc-500 font-normal text-xs">{chain}</span></div>
                  <div className="text-[11px] text-zinc-600 mt-0.5">
                    Seller: {d.demander.slice(0, 16)}...
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!canAfford && hasWallet && (
                    <span className="text-[10px] text-zinc-600">Insufficient funds</span>
                  )}
                  <div className="text-emerald-500 text-xs font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 group-disabled:opacity-0 transition-opacity">
                    Fill <ChevronRight size={12} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Sell View — Create Offer Form
// ============================================================

function SellView({ chain, nexus, childBalance, hasWallet, onConfirm }: {
  chain: string; nexus: string; childBalance: number; hasWallet: boolean
  onConfirm: (params: { amount: number; fee: number }) => void
}) {
  const [amount, setAmount] = useState('')
  const [fee, setFee] = useState('')
  const [feeLoading, setFeeLoading] = useState(true)

  useEffect(() => {
    lattice.getFeeEstimate(5, chain)
      .then(est => setFee(String(est.fee)))
      .catch(() => setFee('100'))
      .finally(() => setFeeLoading(false))
  }, [chain])

  const amountNum = parseInt(amount) || 0
  const feeNum = parseInt(fee) || 0
  const total = amountNum + feeNum
  const canAfford = childBalance >= total && amountNum > 0

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <Tag size={14} />
        Create Sell Offer
      </div>

      <p className="text-xs text-zinc-500">
        Lock your {chain} tokens as an offer. A buyer on {nexus} will fill it and pay you.
      </p>

      {/* Amount input */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-zinc-500">Amount</label>
          <button
            onClick={() => setAmount(String(Math.max(0, childBalance - feeNum)))}
            className="text-[10px] text-lattice-400 hover:text-lattice-300"
          >
            Max: {childBalance.toLocaleString()}
          </button>
        </div>
        <input
          value={amount}
          onChange={e => setAmount(e.target.value)}
          type="number"
          min="1"
          placeholder="0"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-lg font-bold focus:outline-none focus:border-lattice-500 placeholder:text-zinc-700"
        />
      </div>

      {/* Fee */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-zinc-500">
          Network fee {feeLoading && <Loader2 size={10} className="inline animate-spin ml-1" />}
        </span>
        <span className="text-zinc-400">{feeNum.toLocaleString()}</span>
      </div>

      {/* Summary */}
      {amountNum > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">You lock</span>
            <span className="text-zinc-200 font-medium">{total.toLocaleString()} {chain}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">You receive (when filled)</span>
            <span className="text-emerald-400 font-medium">{amountNum.toLocaleString()} {nexus}</span>
          </div>
        </div>
      )}

      {!canAfford && amountNum > 0 && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={12} />
          Insufficient {chain} balance
        </div>
      )}

      <button
        onClick={() => canAfford && onConfirm({ amount: amountNum, fee: feeNum })}
        disabled={!hasWallet || !canAfford}
        className="w-full py-3 bg-red-600/80 hover:bg-red-600 rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors"
      >
        Review Offer
      </button>
    </div>
  )
}

// ============================================================
// Fill Order Modal (Buy flow)
// ============================================================

type FillStep = 'review' | 'executing' | 'done'

function FillOrderModal({ deposit, chain, nexus, nexusBalance, onClose, onComplete }: {
  deposit: DepositEntry; chain: string; nexus: string; nexusBalance: number
  onClose: () => void; onComplete: () => void
}) {
  const { activeAccount, unlock } = useWallet()
  const [step, setStep] = useState<FillStep>('review')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ receipt: false, withdrawal: false })
  const [statusText, setStatusText] = useState('')

  const fee = 100 // could fetch estimate

  const handleConfirm = async () => {
    if (!activeAccount) return
    if (!password) { setError('Enter your password'); return }
    setError('')
    setStep('executing')
    setStatusText('Submitting payment on ' + nexus + '...')

    try {
      const privateKey = await unlock(password)

      // Step 1: Create receipt on Nexus
      const nonceResp = await lattice.getNonce(activeAccount.address, nexus)
      const receiptSigned = await buildReceipt({
        chainPath: [nexus],
        from: activeAccount.address,
        demander: deposit.demander,
        amount: deposit.amountDemanded,
        swapNonce: deposit.nonce,
        directory: chain,
        fee,
        nonce: nonceResp.nonce,
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)
      const receiptResp = await lattice.submitTransaction(receiptSigned, nexus)
      if (!receiptResp.accepted) throw new Error(receiptResp.error || 'Receipt rejected')
      setProgress(p => ({ ...p, receipt: true }))

      // Step 2: Wait briefly for receipt to propagate, then withdraw
      setStatusText('Claiming tokens on ' + chain + '...')
      // Small delay to allow block inclusion
      await new Promise(r => setTimeout(r, 2000))

      const childNonce = await lattice.getNonce(activeAccount.address, chain)
      const withdrawSigned = await buildWithdrawal({
        chainPath: [chain],
        from: activeAccount.address,
        demander: deposit.demander,
        amount: deposit.amountDemanded,
        swapNonce: deposit.nonce,
        fee,
        nonce: childNonce.nonce,
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)
      const withdrawResp = await lattice.submitTransaction(withdrawSigned, chain)
      if (!withdrawResp.accepted) throw new Error(withdrawResp.error || 'Withdrawal rejected')
      setProgress(p => ({ ...p, withdrawal: true }))

      // Save to history
      saveOrder({
        type: 'buy',
        chain,
        amount: deposit.amountDemanded,
        nonce: deposit.nonce,
        demander: deposit.demander,
        receiptTxCID: receiptResp.txCID,
        withdrawTxCID: withdrawResp.txCID,
        timestamp: Date.now(),
        status: 'complete',
      })

      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed')
      if (step === 'executing') setStep('review')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold">
            {step === 'done' ? 'Order Filled' : `Buy ${chain}`}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {step === 'review' && (
            <div className="space-y-4">
              {/* Order summary */}
              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                <div className="text-center">
                  <div className="text-3xl font-bold">{deposit.amountDemanded.toLocaleString()}</div>
                  <div className="text-sm text-zinc-500 mt-1">{chain} tokens</div>
                </div>
                <div className="border-t border-zinc-700/50 pt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You pay</span>
                    <span className="text-zinc-200">{deposit.amountDemanded.toLocaleString()} on {nexus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Network fees (x2)</span>
                    <span className="text-zinc-400">{(fee * 2).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-zinc-400">Total cost</span>
                    <span className="text-zinc-100">{(deposit.amountDemanded + fee * 2).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-zinc-600 text-center">
                Seller: {deposit.demander.slice(0, 24)}...
              </div>

              {/* Password */}
              <div>
                <input
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  type="password"
                  placeholder="Wallet password to confirm"
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600"
                  onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs flex items-center gap-1.5">
                  <AlertCircle size={12} /> {error}
                </p>
              )}

              <button
                onClick={handleConfirm}
                disabled={!password}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                Confirm Purchase
              </button>
            </div>
          )}

          {step === 'executing' && (
            <div className="space-y-4 py-4">
              <div className="text-center mb-6">
                <Loader2 size={32} className="mx-auto text-emerald-400 animate-spin mb-3" />
                <p className="text-sm text-zinc-300">{statusText}</p>
              </div>
              <div className="space-y-2">
                <ProgressStep done={progress.receipt} label="Pay seller on Nexus" />
                <ProgressStep done={progress.withdrawal} label={`Claim tokens on ${chain}`} />
              </div>
              {error && (
                <div className="mt-4">
                  <p className="text-red-400 text-xs flex items-center gap-1.5 mb-3">
                    <AlertCircle size={12} /> {error}
                  </p>
                  <button onClick={() => { setStep('review'); setError('') }} className="w-full py-2 bg-zinc-800 rounded-lg text-sm">
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
              <h3 className="text-lg font-semibold text-emerald-400 mb-1">Purchase Complete</h3>
              <p className="text-sm text-zinc-500 mb-6">
                {deposit.amountDemanded.toLocaleString()} {chain} tokens acquired
              </p>
              <button
                onClick={onComplete}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Create Offer Modal (Sell flow)
// ============================================================

function CreateOfferModal({ amount, fee, chain, nexus, onClose, onComplete }: {
  amount: number; fee: number; chain: string; nexus: string
  onClose: () => void; onComplete: () => void
}) {
  const { activeAccount, unlock } = useWallet()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState<'confirm' | 'executing' | 'done'>('confirm')
  const [offerNonce, setOfferNonce] = useState('')

  const handleConfirm = async () => {
    if (!activeAccount) return
    if (!password) { setError('Enter your password'); return }
    setError('')
    setStep('executing')

    try {
      const privateKey = await unlock(password)
      const nonceResp = await lattice.getNonce(activeAccount.address, chain)
      const swapNonce = generateSwapNonce()
      const signed = await buildDeposit({
        chainPath: [chain],
        from: activeAccount.address,
        amount,
        fee,
        nonce: nonceResp.nonce,
        swapNonce,
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)
      const resp = await lattice.submitTransaction(signed, chain)
      if (!resp.accepted) throw new Error(resp.error || 'Transaction rejected')

      setOfferNonce(swapNonce)
      saveOrder({
        type: 'sell',
        chain,
        amount,
        nonce: swapNonce,
        demander: activeAccount.address,
        depositTxCID: resp.txCID,
        timestamp: Date.now(),
        status: 'open',
      })
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      setStep('confirm')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold">
            {step === 'done' ? 'Offer Created' : `Sell ${chain}`}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold">{amount.toLocaleString()}</div>
                <div className="text-sm text-zinc-500 mt-1">{chain} tokens for sale</div>
                <div className="border-t border-zinc-700/50 mt-3 pt-3 space-y-2 text-xs text-left">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You lock</span>
                    <span className="text-zinc-200">{(amount + fee).toLocaleString()} {chain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You receive (when filled)</span>
                    <span className="text-emerald-400 font-medium">{amount.toLocaleString()} {nexus}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Network fee</span>
                    <span className="text-zinc-400">{fee.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <input
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                type="password"
                placeholder="Wallet password to confirm"
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-500 placeholder:text-zinc-600"
                onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              />

              {error && (
                <p className="text-red-400 text-xs flex items-center gap-1.5">
                  <AlertCircle size={12} /> {error}
                </p>
              )}

              <button
                onClick={handleConfirm}
                disabled={!password}
                className="w-full py-3.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                Confirm Sell Offer
              </button>
            </div>
          )}

          {step === 'executing' && (
            <div className="text-center py-8">
              <Loader2 size={32} className="mx-auto text-red-400 animate-spin mb-3" />
              <p className="text-sm text-zinc-300">Creating your offer...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
              <h3 className="text-lg font-semibold text-emerald-400 mb-1">Offer Live</h3>
              <p className="text-sm text-zinc-500 mb-4">
                Your {amount.toLocaleString()} {chain} offer is now visible to buyers.
              </p>
              <p className="text-xs text-zinc-600 mb-6">
                You'll receive {amount.toLocaleString()} on {nexus} when a buyer fills your order.
              </p>
              <button
                onClick={onComplete}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// My Orders
// ============================================================

interface SavedOrder {
  type: 'buy' | 'sell'
  chain: string
  amount: number
  nonce: string
  demander: string
  depositTxCID?: string
  receiptTxCID?: string
  withdrawTxCID?: string
  timestamp: number
  status: 'open' | 'complete' | 'partial'
}

function saveOrder(order: SavedOrder) {
  const stored: SavedOrder[] = JSON.parse(localStorage.getItem('lattice_orders') || '[]')
  stored.unshift(order)
  localStorage.setItem('lattice_orders', JSON.stringify(stored.slice(0, 100)))
}

function MyOrders({ childChains, nexus }: { childChains: string[]; nexus: string }) {
  const [orders, setOrders] = useState<SavedOrder[]>(() =>
    JSON.parse(localStorage.getItem('lattice_orders') || '[]')
  )
  const [checking, setChecking] = useState<number | null>(null)

  const checkOrderStatus = async (order: SavedOrder, index: number) => {
    setChecking(index)
    try {
      const dep = await lattice.getDepositState({
        demander: order.demander,
        amount: order.amount,
        nonce: order.nonce,
        chain: order.chain,
      })
      const rec = await lattice.getReceiptState({
        demander: order.demander,
        amount: order.amount,
        nonce: order.nonce,
        directory: order.chain,
      })

      let newStatus: SavedOrder['status'] = 'open'
      if (rec.exists && !dep.exists) {
        newStatus = 'complete'
      } else if (rec.exists || dep.exists) {
        newStatus = 'partial'
      }

      if (newStatus !== order.status) {
        const updated = [...orders]
        updated[index] = { ...order, status: newStatus }
        setOrders(updated)
        localStorage.setItem('lattice_orders', JSON.stringify(updated))
      }
    } catch {}
    setChecking(null)
  }

  if (orders.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
        <Clock size={28} className="mx-auto text-zinc-700 mb-3" />
        <p className="text-sm text-zinc-500">No orders yet</p>
        <p className="text-xs text-zinc-600 mt-1">Your buy and sell orders will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map((order, i) => (
        <div
          key={`${order.nonce}-${i}`}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                order.type === 'buy'
                  ? 'bg-emerald-600/15 text-emerald-400'
                  : 'bg-red-600/15 text-red-400'
              }`}>
                {order.type}
              </span>
              <span className="text-sm font-medium">{order.amount.toLocaleString()} {order.chain}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <button
                onClick={() => checkOrderStatus(order, i)}
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
                title="Check status"
              >
                <RefreshCw size={12} className={checking === i ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{new Date(order.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="font-mono">{order.nonce.slice(0, 12)}...</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Shared Components
// ============================================================

function ProgressStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
      ) : (
        <div className="w-[18px] h-[18px] rounded-full border-2 border-zinc-700 shrink-0" />
      )}
      <span className={`text-sm ${done ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: SavedOrder['status'] }) {
  switch (status) {
    case 'complete':
      return (
        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
          <CheckCircle2 size={10} /> Filled
        </span>
      )
    case 'partial':
      return (
        <span className="flex items-center gap-1 text-[10px] text-yellow-400">
          <Clock size={10} /> In Progress
        </span>
      )
    default:
      return (
        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
          <Clock size={10} /> Open
        </span>
      )
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-zinc-500 hover:text-zinc-300 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  )
}

function generateSwapNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}
