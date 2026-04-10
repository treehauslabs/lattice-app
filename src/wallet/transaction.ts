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

export interface SwapParams {
  chainPath: string[]
  from: string
  recipient: string
  amount: number
  fee: number
  nonce: number
  swapNonce: string  // UInt128 as hex
  timelock: number
  signerPublicKey: string
}

export async function buildSwap(params: SwapParams, privateKeyHex: string): Promise<SignedTransaction> {
  const body: PrepareTransactionRequest = {
    chainPath: params.chainPath,
    nonce: params.nonce,
    signers: [params.from],
    fee: params.fee,
    accountActions: [
      { owner: params.from, delta: -(params.amount + params.fee) },
    ],
    swapActions: [{
      nonce: params.swapNonce,
      sender: params.from,
      recipient: params.recipient,
      amount: params.amount,
      timelock: params.timelock,
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
