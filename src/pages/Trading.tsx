import { useState, useEffect } from 'react'
import {
  ArrowDownUp, Copy, Check, Loader2, CheckCircle2,
  Clock, AlertCircle, X, RefreshCw, ChevronRight,
  ShoppingCart, Tag, Wallet,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useNode } from '../hooks/useNode'
import { useWallet } from '../hooks/useWallet'
import { lattice } from '../api/client'
import { buildDeposit, buildReceipt, buildWithdrawal } from '../wallet/transaction'
import { qk, useBalance, useDeposits, useFeeEstimate } from '../hooks/queries'
import type { DepositEntry } from '../api/types'

// ============================================================
// Main Page
// ============================================================

export function Trading() {
  const { connected, chains, selectedChain } = useNode()
  const { activeAccount } = useWallet()
  const [tab, setTab] = useState<'trade' | 'orders'>('trade')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [fillDeposit, setFillDeposit] = useState<DepositEntry | null>(null)
  const [showSellConfirm, setShowSellConfirm] = useState<{ amountDeposited: number; amountDemanded: number; fee: number } | null>(null)

  // Trading is between a child chain and its DIRECT parent (the chain tree
  // can be many levels deep — receipts settle on the immediate parent, not
  // necessarily the nexus root).
  const tradeable = chains.filter(c => c.parentDirectory)
  const activeChain = tradeable.find(c => c.directory === selectedChain) ?? tradeable[0]
  const activeChild = activeChain?.directory ?? ''
  const parent = activeChain?.parentDirectory ?? ''

  const parentBalanceQ = useBalance(activeAccount?.address, parent)
  const childBalanceQ = useBalance(activeAccount?.address, activeChild)

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

  const parentBalance = parentBalanceQ.data ?? 0
  const childBalance = childBalanceQ.data ?? 0

  if (!activeChild) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <ArrowDownUp size={48} className="mx-auto text-zinc-700 mb-4" />
          <h2 className="text-xl font-bold text-zinc-300 mb-2">Exchange</h2>
          <p className="text-zinc-500 text-sm max-w-xs">
            No child chains available to trade. Use the Foundry to deploy one.
          </p>
        </div>
      </div>
    )
  }

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
                  <div className="text-[11px] text-zinc-500">{parent}</div>
                  <div className="text-xl font-bold">{parentBalance.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500">{activeChild}</div>
                  <div className="text-xl font-bold">{childBalance.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center">
              <Wallet size={20} className="mx-auto text-zinc-600 mb-2" />
              <p className="text-sm text-zinc-400 mb-1">Create a wallet to start trading</p>
              <p className="text-xs text-zinc-600">Go to Wallet to create or import an account</p>
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
              parent={parent}
              parentBalance={parentBalance}
              onFill={setFillDeposit}
              hasWallet={!!activeAccount}
            />
          ) : (
            <SellView
              chain={activeChild}
              parent={parent}
              childBalance={childBalance}
              hasWallet={!!activeAccount}
              onConfirm={setShowSellConfirm}
            />
          )}
        </div>
      ) : (
        <MyOrders chains={tradeable} />
      )}

      {/* Fill order modal */}
      {fillDeposit && (
        <FillOrderModal
          deposit={fillDeposit}
          chain={activeChild}
          parent={parent}
          parentBalance={parentBalance}
          onClose={() => setFillDeposit(null)}
          onComplete={() => setFillDeposit(null)}
        />
      )}

      {/* Create offer modal */}
      {showSellConfirm && (
        <CreateOfferModal
          amountDeposited={showSellConfirm.amountDeposited}
          amountDemanded={showSellConfirm.amountDemanded}
          fee={showSellConfirm.fee}
          chain={activeChild}
          parent={parent}
          onClose={() => setShowSellConfirm(null)}
          onComplete={() => setShowSellConfirm(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// Buy View — Order Book
// ============================================================

function BuyView({ chain, parent, parentBalance, onFill, hasWallet }: {
  chain: string; parent: string; parentBalance: number; onFill: (d: DepositEntry) => void; hasWallet: boolean
}) {
  void parent
  const depositsQ = useDeposits(chain)
  // Sort by best price for the buyer: lowest nexus-per-child rate first
  const deposits = (depositsQ.data?.deposits ?? []).slice().sort((a, b) => {
    const ra = a.amountDeposited > 0 ? a.amountDemanded / a.amountDeposited : Infinity
    const rb = b.amountDeposited > 0 ? b.amountDemanded / b.amountDeposited : Infinity
    return ra - rb
  })
  const loading = depositsQ.isLoading

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ShoppingCart size={14} className="text-zinc-400" />
          <span className="text-sm font-medium">Available Orders</span>
          <span className="text-xs text-zinc-500">({deposits.length})</span>
        </div>
        <button onClick={() => depositsQ.refetch()} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <RefreshCw size={12} className={depositsQ.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && deposits.length === 0 ? (
        <div className="p-8 text-center">
          <Loader2 size={20} className="mx-auto text-zinc-600 animate-spin mb-2" />
          <p className="text-xs text-zinc-600">Loading orders...</p>
        </div>
      ) : deposits.length === 0 ? (
        <div className="p-8 text-center">
          <Tag size={20} className="mx-auto text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-400">No orders available</p>
          <p className="text-xs text-zinc-600 mt-2 max-w-[240px] mx-auto leading-relaxed">
            When someone creates a sell offer on {chain}, it will appear here for you to fill
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/50">
          {deposits.map((d, i) => {
            const canAfford = parentBalance >= d.amountDemanded
            const rate = d.amountDeposited > 0 ? d.amountDemanded / d.amountDeposited : 0
            return (
              <button
                key={`${d.nonce}-${i}`}
                onClick={() => hasWallet && canAfford && onFill(d)}
                disabled={!hasWallet || !canAfford}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <div className="text-left">
                  <div className="text-sm font-semibold">
                    {d.amountDeposited.toLocaleString()} <span className="text-zinc-500 font-normal text-xs">{chain}</span>
                    <span className="text-zinc-600 mx-1.5">→</span>
                    <span className="text-emerald-400">{d.amountDemanded.toLocaleString()}</span>
                  </div>
                  <div className="text-[11px] text-zinc-600 mt-0.5">
                    Rate: {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} per {chain} · Seller {d.demander.slice(0, 12)}...
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

function SellView({ chain, parent, childBalance, hasWallet, onConfirm }: {
  chain: string; parent: string; childBalance: number; hasWallet: boolean
  onConfirm: (params: { amountDeposited: number; amountDemanded: number; fee: number }) => void
}) {
  const feeQ = useFeeEstimate(5, chain)
  const [sellAmount, setSellAmount] = useState('')
  const [askAmount, setAskAmount] = useState('')
  const [fee, setFee] = useState('')
  const feeLoading = feeQ.isLoading

  useEffect(() => {
    if (feeQ.data) setFee(String(feeQ.data.fee))
    else if (feeQ.isError) setFee('100')
  }, [feeQ.data, feeQ.isError])

  const sellNum = parseInt(sellAmount) || 0
  const askNum = parseInt(askAmount) || 0
  const feeNum = parseInt(fee) || 0
  const total = sellNum + feeNum
  const canAfford = childBalance >= total && sellNum > 0 && askNum > 0
  const rate = sellNum > 0 ? askNum / sellNum : 0

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        <Tag size={14} />
        Create Sell Offer
      </div>

      <p className="text-xs text-zinc-500">
        Lock {chain} tokens at a price of your choosing. A buyer on {parent} pays you to unlock them.
      </p>

      {/* Sell amount (deposited on child) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-zinc-500">You sell ({chain})</label>
          <button
            onClick={() => setSellAmount(String(Math.max(0, childBalance - feeNum)))}
            className="text-[10px] text-lattice-400 hover:text-lattice-300"
          >
            Max: {childBalance.toLocaleString()}
          </button>
        </div>
        <input
          value={sellAmount}
          onChange={e => setSellAmount(e.target.value)}
          type="number"
          min="1"
          placeholder="0"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-lg font-bold focus:outline-none focus:border-lattice-500 placeholder:text-zinc-700"
        />
      </div>

      {/* Ask amount (demanded on parent) */}
      <div>
        <label className="text-xs text-zinc-500 mb-1.5 block">You receive ({parent})</label>
        <input
          value={askAmount}
          onChange={e => setAskAmount(e.target.value)}
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
      {sellNum > 0 && askNum > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">You lock</span>
            <span className="text-zinc-200 font-medium">{total.toLocaleString()} {chain}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Rate</span>
            <span className="text-zinc-400">{rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {parent} per {chain}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">You receive (when filled)</span>
            <span className="text-emerald-400 font-medium">{askNum.toLocaleString()} {parent}</span>
          </div>
        </div>
      )}

      {!canAfford && sellNum > 0 && (
        <div className="flex items-center gap-2 text-red-400 text-xs">
          <AlertCircle size={12} />
          {childBalance < total ? `Insufficient ${chain} balance` : 'Set both amounts'}
        </div>
      )}

      <button
        onClick={() => canAfford && onConfirm({ amountDeposited: sellNum, amountDemanded: askNum, fee: feeNum })}
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

function FillOrderModal({ deposit, chain, parent, parentBalance, onClose, onComplete }: {
  deposit: DepositEntry; chain: string; parent: string; parentBalance: number
  onClose: () => void; onComplete: () => void
}) {
  void parentBalance
  const { activeAccount, unlock } = useWallet()
  const queryClient = useQueryClient()
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
    setStatusText('Submitting payment on ' + parent + '...')

    try {
      const privateKey = await unlock(password)

      // Step 1: Create receipt on the deposit's parent chain
      const nonceResp = await lattice.getNonce(activeAccount.address, parent)
      const receiptSigned = await buildReceipt({
        chainPath: [parent],
        from: activeAccount.address,
        demander: deposit.demander,
        amount: deposit.amountDemanded,
        swapNonce: deposit.nonce,
        directory: chain,
        fee,
        nonce: nonceResp.nonce,
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)
      const receiptResp = await lattice.submitTransaction(receiptSigned, parent)
      if (!receiptResp.accepted) throw new Error(receiptResp.error || 'Receipt rejected')
      queryClient.invalidateQueries({ queryKey: qk.mempool(parent) })
      queryClient.invalidateQueries({ queryKey: qk.nonce(activeAccount.address, parent) })
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
        amountDemanded: deposit.amountDemanded,
        amountWithdrawn: deposit.amountDeposited,
        swapNonce: deposit.nonce,
        fee,
        nonce: childNonce.nonce,
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)
      const withdrawResp = await lattice.submitTransaction(withdrawSigned, chain)
      if (!withdrawResp.accepted) throw new Error(withdrawResp.error || 'Withdrawal rejected')
      queryClient.invalidateQueries({ queryKey: qk.mempool(chain) })
      queryClient.invalidateQueries({ queryKey: qk.nonce(activeAccount.address, chain) })
      queryClient.invalidateQueries({ queryKey: qk.deposits(chain) })
      setProgress(p => ({ ...p, withdrawal: true }))

      // Save to history
      saveOrder({
        type: 'buy',
        chain,
        amountDeposited: deposit.amountDeposited,
        amountDemanded: deposit.amountDemanded,
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
                  <div className="text-3xl font-bold">{deposit.amountDeposited.toLocaleString()}</div>
                  <div className="text-sm text-zinc-500 mt-1">{chain} tokens</div>
                </div>
                <div className="border-t border-zinc-700/50 pt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You pay</span>
                    <span className="text-zinc-200">{deposit.amountDemanded.toLocaleString()} on {parent}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Rate</span>
                    <span className="text-zinc-400">
                      {(deposit.amountDeposited > 0 ? deposit.amountDemanded / deposit.amountDeposited : 0)
                        .toLocaleString(undefined, { maximumFractionDigits: 4 })} {parent} per {chain}
                    </span>
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
                <ProgressStep done={progress.receipt} label={`Pay seller on ${parent}`} />
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

function CreateOfferModal({ amountDeposited, amountDemanded, fee, chain, parent, onClose, onComplete }: {
  amountDeposited: number; amountDemanded: number; fee: number; chain: string; parent: string
  onClose: () => void; onComplete: () => void
}) {
  const { activeAccount, unlock } = useWallet()
  const queryClient = useQueryClient()
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
        amountDeposited,
        amountDemanded,
        fee,
        nonce: nonceResp.nonce,
        swapNonce,
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)
      const resp = await lattice.submitTransaction(signed, chain)
      if (!resp.accepted) throw new Error(resp.error || 'Transaction rejected')
      queryClient.invalidateQueries({ queryKey: qk.mempool(chain) })
      queryClient.invalidateQueries({ queryKey: qk.nonce(activeAccount.address, chain) })
      queryClient.invalidateQueries({ queryKey: qk.deposits(chain) })

      setOfferNonce(swapNonce)
      saveOrder({
        type: 'sell',
        chain,
        amountDeposited,
        amountDemanded,
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
                <div className="text-3xl font-bold">{amountDeposited.toLocaleString()}</div>
                <div className="text-sm text-zinc-500 mt-1">{chain} tokens for sale</div>
                <div className="border-t border-zinc-700/50 mt-3 pt-3 space-y-2 text-xs text-left">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You lock</span>
                    <span className="text-zinc-200">{(amountDeposited + fee).toLocaleString()} {chain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">You receive (when filled)</span>
                    <span className="text-emerald-400 font-medium">{amountDemanded.toLocaleString()} {parent}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Rate</span>
                    <span className="text-zinc-400">
                      {(amountDeposited > 0 ? amountDemanded / amountDeposited : 0)
                        .toLocaleString(undefined, { maximumFractionDigits: 4 })} {parent} per {chain}
                    </span>
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
                Your {amountDeposited.toLocaleString()} {chain} offer is now visible to buyers.
              </p>
              <p className="text-xs text-zinc-600 mb-6">
                You'll receive {amountDemanded.toLocaleString()} on {parent} when a buyer fills your order.
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
  amountDeposited: number   // child-chain tokens locked / received
  amountDemanded: number    // nexus tokens demanded / paid
  nonce: string
  demander: string
  depositTxCID?: string
  receiptTxCID?: string
  withdrawTxCID?: string
  claimTxCID?: string
  timestamp: number
  status: 'open' | 'complete' | 'partial' | 'claimable'
}

function saveOrder(order: SavedOrder) {
  const stored: SavedOrder[] = JSON.parse(localStorage.getItem('lattice_orders') || '[]')
  stored.unshift(order)
  localStorage.setItem('lattice_orders', JSON.stringify(stored.slice(0, 100)))
}

function MyOrders({ chains }: { chains: { directory: string; parentDirectory: string | null }[] }) {
  const parentOf = (dir: string) => chains.find(c => c.directory === dir)?.parentDirectory ?? ''
  const [orders, setOrders] = useState<SavedOrder[]>(() =>
    JSON.parse(localStorage.getItem('lattice_orders') || '[]')
  )
  const [checking, setChecking] = useState<number | null>(null)
  const [claimOrder, setClaimOrder] = useState<{ order: SavedOrder; index: number } | null>(null)

  const updateOrder = (index: number, updates: Partial<SavedOrder>) => {
    const updated = [...orders]
    updated[index] = { ...updated[index], ...updates }
    setOrders(updated)
    localStorage.setItem('lattice_orders', JSON.stringify(updated))
  }

  const checkOrderStatus = async (order: SavedOrder, index: number) => {
    setChecking(index)
    try {
      const dep = await lattice.getDepositState({
        demander: order.demander,
        amount: order.amountDemanded,
        nonce: order.nonce,
        chain: order.chain,
      })
      const rec = await lattice.getReceiptState({
        demander: order.demander,
        amount: order.amountDemanded,
        nonce: order.nonce,
        directory: order.chain,
      })

      let newStatus: SavedOrder['status'] = 'open'
      if (order.type === 'sell' && rec.exists && !order.claimTxCID) {
        newStatus = 'claimable'
      } else if (rec.exists && !dep.exists) {
        newStatus = order.claimTxCID ? 'complete' : (order.type === 'buy' ? 'complete' : 'claimable')
      } else if (rec.exists || dep.exists) {
        newStatus = 'partial'
      }

      if (newStatus !== order.status) {
        updateOrder(index, { status: newStatus })
      }
    } catch {}
    setChecking(null)
  }

  if (orders.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <Clock size={24} className="mx-auto text-zinc-700 mb-3" />
        <p className="text-sm text-zinc-400 mb-4">No orders yet</p>
        <div className="bg-zinc-800/40 rounded-lg p-4 text-left text-xs text-zinc-500 space-y-2">
          <p className="text-zinc-400 font-medium mb-2">How cross-chain trading works:</p>
          <p>1. A seller creates an offer, locking tokens on a child chain</p>
          <p>2. A buyer fills the offer — payment and token claim happen automatically</p>
          <p>3. The seller's payment is auto-credited on the parent chain</p>
        </div>
      </div>
    )
  }

  return (
    <>
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
                <span className="text-sm font-medium">
                  {order.amountDeposited.toLocaleString()} {order.chain}
                  <span className="text-zinc-600 mx-1.5">→</span>
                  <span className="text-zinc-400">{order.amountDemanded.toLocaleString()} {parentOf(order.chain)}</span>
                </span>
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
              {order.status === 'claimable' ? (
                <button
                  onClick={() => setClaimOrder({ order, index: i })}
                  className="text-emerald-400 font-semibold hover:text-emerald-300 flex items-center gap-1 transition-colors"
                >
                  Claim Payment <ChevronRight size={12} />
                </button>
              ) : (
                <span className="font-mono">{order.nonce.slice(0, 12)}...</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {claimOrder && (
        <ClaimPaymentModal
          order={claimOrder.order}
          parent={parentOf(claimOrder.order.chain)}
          onClose={() => setClaimOrder(null)}
          onComplete={(claimTxCID) => {
            updateOrder(claimOrder.index, { status: 'complete', claimTxCID })
            setClaimOrder(null)
          }}
        />
      )}
    </>
  )
}

// ============================================================
// Claim Payment Modal (Seller collects parent-chain payment)
// ============================================================

function ClaimPaymentModal({ order, parent, onClose, onComplete }: {
  order: SavedOrder; parent: string
  onClose: () => void; onComplete: (claimTxCID: string) => void
}) {
  const { activeAccount, unlock } = useWallet()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'review' | 'executing' | 'done'>('review')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [claimTxCID, setClaimTxCID] = useState('')

  const fee = 100

  const handleClaim = async () => {
    if (!activeAccount) return
    if (!password) { setError('Enter your password'); return }
    setError('')
    setStep('executing')

    try {
      const privateKey = await unlock(password)
      const nonceResp = await lattice.getNonce(activeAccount.address, parent)

      const withdrawSigned = await buildWithdrawal({
        chainPath: [parent],
        from: activeAccount.address,
        demander: order.demander,
        amountDemanded: order.amountDemanded,
        amountWithdrawn: order.amountDeposited,
        swapNonce: order.nonce,
        fee,
        nonce: nonceResp.nonce,
        signerPublicKey: activeAccount.publicKey,
      }, privateKey)

      const resp = await lattice.submitTransaction(withdrawSigned, parent)
      if (!resp.accepted) throw new Error(resp.error || 'Claim rejected')
      queryClient.invalidateQueries({ queryKey: qk.mempool(parent) })
      queryClient.invalidateQueries({ queryKey: qk.nonce(activeAccount.address, parent) })

      setClaimTxCID(resp.txCID)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed')
      setStep('review')
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
            {step === 'done' ? 'Payment Claimed' : 'Claim Payment'}
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">{order.amountDemanded.toLocaleString()}</div>
                <div className="text-sm text-zinc-500 mt-1">{parent} tokens to claim</div>
                <div className="border-t border-zinc-700/50 mt-3 pt-3 space-y-2 text-xs text-left">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">From your sell offer</span>
                    <span className="text-zinc-200">{order.amountDeposited.toLocaleString()} {order.chain}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Network fee</span>
                    <span className="text-zinc-400">{fee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-zinc-400">You receive</span>
                    <span className="text-emerald-400">{(order.amountDemanded - fee).toLocaleString()} {parent}</span>
                  </div>
                </div>
              </div>

              <input
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                type="password"
                placeholder="Wallet password to confirm"
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600"
                onKeyDown={e => e.key === 'Enter' && handleClaim()}
              />

              {error && (
                <p className="text-red-400 text-xs flex items-center gap-1.5">
                  <AlertCircle size={12} /> {error}
                </p>
              )}

              <button
                onClick={handleClaim}
                disabled={!password}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                Claim Payment
              </button>
            </div>
          )}

          {step === 'executing' && (
            <div className="text-center py-8">
              <Loader2 size={32} className="mx-auto text-emerald-400 animate-spin mb-3" />
              <p className="text-sm text-zinc-300">Claiming payment on {parent}...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
              <h3 className="text-lg font-semibold text-emerald-400 mb-1">Payment Claimed</h3>
              <p className="text-sm text-zinc-500 mb-2">
                {order.amountDemanded.toLocaleString()} {parent} added to your balance
              </p>
              <p className="text-xs font-mono text-zinc-600 break-all mb-6">{claimTxCID}</p>
              <button
                onClick={() => onComplete(claimTxCID)}
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
          <CheckCircle2 size={10} /> Complete
        </span>
      )
    case 'claimable':
      return (
        <span className="flex items-center gap-1 text-[10px] text-lattice-400 font-semibold">
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
