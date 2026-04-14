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
// Locks demander's funds in the deposit state
export interface DepositParams {
  chainPath: string[]
  from: string          // demander address
  amount: number        // amountDemanded = amountDeposited
  fee: number
  nonce: number         // transaction nonce
  swapNonce: string     // UInt128 hex — shared across all three steps
  signerPublicKey: string
}

export async function buildDeposit(params: DepositParams, privateKeyHex: string): Promise<SignedTransaction> {
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: -(params.amount + params.fee) },
    ],
    depositActions: [{
      nonce: params.swapNonce,
      demander: params.from,
      amountDemanded: params.amount,
      amountDeposited: params.amount,
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

// Cross-chain swap: Step 3 — Withdrawal on child chain
// Withdrawer claims the deposited funds
export interface WithdrawalParams {
  chainPath: string[]
  from: string          // withdrawer address
  demander: string      // demander address (from deposit)
  amount: number        // amountDemanded = amountWithdrawn
  swapNonce: string     // UInt128 hex (same as deposit)
  fee: number
  nonce: number         // transaction nonce
  signerPublicKey: string
}

export async function buildWithdrawal(params: WithdrawalParams, privateKeyHex: string): Promise<SignedTransaction> {
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: params.amount - params.fee },
    ],
    withdrawalActions: [{
      withdrawer: params.from,
      nonce: params.swapNonce,
      demander: params.demander,
      amountDemanded: params.amount,
      amountWithdrawn: params.amount,
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
