import { lattice } from '../api/client'
import { sign } from './signer'
import type { PrepareTransactionRequest, SubmitTransactionResponse } from '../api/types'

export interface TransferParams {
  chainPath: string[]
  from: string       // sender address (CID of public key)
  to: string         // recipient address
  amount: number
  fee: number
  nonce: number
  signerPublicKey: string  // hex compressed public key
}

export interface SignedTransaction {
  signatures: Record<string, string>
  bodyCID: string
  bodyData: string
}

export async function buildTransfer(params: TransferParams, privateKeyHex: string): Promise<SignedTransaction> {
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: -(params.amount + params.fee) },
      { owner: params.to, delta: params.amount },
    ],
  }

  const prepared = await lattice.prepareTransaction(body)
  const signature = sign(prepared.bodyCID, privateKeyHex)

  return {
    signatures: { [params.signerPublicKey]: signature },
    bodyCID: prepared.bodyCID,
    bodyData: prepared.bodyData,
  }
}

export async function submitTransfer(params: TransferParams, privateKeyHex: string, chain?: string): Promise<SubmitTransactionResponse> {
  const signed = await buildTransfer(params, privateKeyHex)
  return lattice.submitTransaction(signed, chain)
}

// Cross-chain swap: Step 1 — Deposit on child chain
// Locks `amountDeposited` of demander's child-chain funds; the order is filled
// when someone pays `amountDemanded` on the nexus chain. Variable-rate price
// discovery: amountDeposited may differ from amountDemanded.
export interface DepositParams {
  chainPath: string[]
  from: string             // demander address
  amountDeposited: number  // child-chain tokens locked
  amountDemanded: number   // nexus tokens demanded as payment
  fee: number
  nonce: number            // transaction nonce
  swapNonce: string        // UInt128 hex — shared across all three steps
  signerPublicKey: string
}

export async function buildDeposit(params: DepositParams, privateKeyHex: string): Promise<SignedTransaction> {
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: -(params.amountDeposited + params.fee) },
    ],
    depositActions: [{
      nonce: params.swapNonce,
      demander: params.from,
      amountDemanded: params.amountDemanded,
      amountDeposited: params.amountDeposited,
    }],
  }

  const prepared = await lattice.prepareTransaction(body)
  const signature = sign(prepared.bodyCID, privateKeyHex)

  return {
    signatures: { [params.signerPublicKey]: signature },
    bodyCID: prepared.bodyCID,
    bodyData: prepared.bodyData,
  }
}

// Cross-chain swap: Step 2 — Receipt on nexus chain
// Withdrawer pays the demander on nexus (implicit debit/credit)
export interface ReceiptParams {
  chainPath: string[]
  from: string          // withdrawer address
  demander: string      // demander address (from deposit)
  amount: number        // amountDemanded (from deposit)
  swapNonce: string     // UInt128 hex (same as deposit)
  directory: string     // child chain directory where deposit lives
  fee: number
  nonce: number         // transaction nonce
  signerPublicKey: string
}

export async function buildReceipt(params: ReceiptParams, privateKeyHex: string): Promise<SignedTransaction> {
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: -params.fee },
    ],
    receiptActions: [{
      withdrawer: params.from,
      nonce: params.swapNonce,
      demander: params.demander,
      amountDemanded: params.amount,
      directory: params.directory,
    }],
  }

  const prepared = await lattice.prepareTransaction(body)
  const signature = sign(prepared.bodyCID, privateKeyHex)

  return {
    signatures: { [params.signerPublicKey]: signature },
    bodyCID: prepared.bodyCID,
    bodyData: prepared.bodyData,
  }
}

// Cross-chain swap: Step 2 (batch) — Receipt on nexus paying multiple sellers in one transaction
export interface BatchReceiptItem {
  demander: string
  amount: number      // amountDemanded for this deposit
  swapNonce: string
  directory: string   // child chain holding the deposit
}

export async function buildBatchReceipt(params: {
  chainPath: string[]
  from: string
  signerPublicKey: string
  fee: number
  nonce: number
  items: BatchReceiptItem[]
}, privateKeyHex: string): Promise<SignedTransaction> {
  const totalDemanded = params.items.reduce((s, it) => s + it.amount, 0)
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: -params.fee },
    ],
    receiptActions: params.items.map(it => ({
      withdrawer: params.from,
      nonce: it.swapNonce,
      demander: it.demander,
      amountDemanded: it.amount,
      directory: it.directory,
    })),
  }
  void totalDemanded
  const prepared = await lattice.prepareTransaction(body)
  const signature = sign(prepared.bodyCID, privateKeyHex)
  return {
    signatures: { [params.signerPublicKey]: signature },
    bodyCID: prepared.bodyCID,
    bodyData: prepared.bodyData,
  }
}

// Cross-chain swap: Step 3 (batch) — Withdrawal on child claiming multiple deposits in one transaction
export interface BatchWithdrawalItem {
  demander: string
  amountDemanded: number    // nexus payment claimed via receipt
  amountWithdrawn: number   // child-chain tokens unlocked (must match deposit.amountDeposited)
  swapNonce: string
}

export async function buildBatchWithdrawal(params: {
  chainPath: string[]
  from: string
  signerPublicKey: string
  fee: number
  nonce: number
  items: BatchWithdrawalItem[]
}, privateKeyHex: string): Promise<SignedTransaction> {
  const totalWithdrawn = params.items.reduce((s, it) => s + it.amountWithdrawn, 0)
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: totalWithdrawn - params.fee },
    ],
    withdrawalActions: params.items.map(it => ({
      withdrawer: params.from,
      nonce: it.swapNonce,
      demander: it.demander,
      amountDemanded: it.amountDemanded,
      amountWithdrawn: it.amountWithdrawn,
    })),
  }
  const prepared = await lattice.prepareTransaction(body)
  const signature = sign(prepared.bodyCID, privateKeyHex)
  return {
    signatures: { [params.signerPublicKey]: signature },
    bodyCID: prepared.bodyCID,
    bodyData: prepared.bodyData,
  }
}

// Cross-chain swap: Step 3 — Withdrawal on child chain
// Withdrawer claims the deposited funds. amountWithdrawn must equal the
// deposit's amountDeposited (validated on-chain); amountDemanded matches
// what was paid on the receipt.
export interface WithdrawalParams {
  chainPath: string[]
  from: string             // withdrawer address
  demander: string         // demander address (from deposit)
  amountDemanded: number   // amount paid on the nexus receipt
  amountWithdrawn: number  // amount unlocked from the deposit (must match deposit.amountDeposited)
  swapNonce: string        // UInt128 hex (same as deposit)
  fee: number
  nonce: number            // transaction nonce
  signerPublicKey: string
}

export async function buildWithdrawal(params: WithdrawalParams, privateKeyHex: string): Promise<SignedTransaction> {
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: params.amountWithdrawn - params.fee },
    ],
    withdrawalActions: [{
      withdrawer: params.from,
      nonce: params.swapNonce,
      demander: params.demander,
      amountDemanded: params.amountDemanded,
      amountWithdrawn: params.amountWithdrawn,
    }],
  }

  const prepared = await lattice.prepareTransaction(body)
  const signature = sign(prepared.bodyCID, privateKeyHex)

  return {
    signatures: { [params.signerPublicKey]: signature },
    bodyCID: prepared.bodyCID,
    bodyData: prepared.bodyData,
  }
}
