import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import {
  loadKeystore, saveKeystore, addAccount, removeAccount,
  encryptPrivateKey, decryptPrivateKey,
  type KeystoreState, type StoredAccount,
} from '../wallet/keystore'
import { generateKeyPair, publicKeyFromPrivate, computeAddress } from '../wallet/signer'

interface WalletState {
  accounts: StoredAccount[]
  activeAccount: StoredAccount | null
  activeIndex: number
  minerAccount: StoredAccount | null
  minerIndex: number
  setActiveIndex: (i: number) => void
  createAccount: (name: string, password: string, opts?: { isMiner?: boolean }) => Promise<void>
  createMinerAccount: (password: string) => Promise<void>
  importAccount: (name: string, privateKeyHex: string, password: string, opts?: { isMiner?: boolean }) => Promise<void>
  deleteAccount: (index: number) => void
  unlock: (password: string) => Promise<string>
  unlockAt: (index: number, password: string) => Promise<string>
  locked: boolean
  lock: () => void
}

const WalletContext = createContext<WalletState | null>(null)

export function useWalletProvider(): WalletState {
  const [state, setState] = useState<KeystoreState>(loadKeystore)
  const [unlockedKey, setUnlockedKey] = useState<string | null>(null)

  useEffect(() => { saveKeystore(state) }, [state])

  const createAccount = useCallback(async (name: string, password: string, opts?: { isMiner?: boolean }) => {
    const { privateKey, publicKey } = generateKeyPair()
    const address = computeAddress(publicKey)
    const encrypted = await encryptPrivateKey(privateKey, password)
    const account: StoredAccount = {
      name,
      publicKey,
      address,
      encrypted,
      createdAt: Date.now(),
      ...(opts?.isMiner ? { isMiner: true } : {}),
    }
    setState(prev => addAccount(prev, account))
  }, [])

  const createMinerAccount = useCallback(async (password: string) => {
    await createAccount('Miner', password, { isMiner: true })
  }, [createAccount])

  const importAccount = useCallback(async (name: string, privateKeyHex: string, password: string, opts?: { isMiner?: boolean }) => {
    const publicKey = publicKeyFromPrivate(privateKeyHex)
    const address = computeAddress(publicKey)
    const encrypted = await encryptPrivateKey(privateKeyHex, password)
    const account: StoredAccount = {
      name,
      publicKey,
      address,
      encrypted,
      createdAt: Date.now(),
      ...(opts?.isMiner ? { isMiner: true } : {}),
    }
    setState(prev => {
      const cleared = opts?.isMiner
        ? { ...prev, accounts: prev.accounts.map(a => a.isMiner ? { ...a, isMiner: false } : a) }
        : prev
      return addAccount(cleared, account)
    })
  }, [])

  const deleteAccount = useCallback((index: number) => {
    setState(prev => removeAccount(prev, index))
    setUnlockedKey(null)
  }, [])

  const setActiveIndex = useCallback((i: number) => {
    setState(prev => ({ ...prev, activeIndex: i }))
    setUnlockedKey(null)
  }, [])

  const unlock = useCallback(async (password: string): Promise<string> => {
    const account = state.accounts[state.activeIndex]
    if (!account) throw new Error('No active account')
    const key = await decryptPrivateKey(account.encrypted, password)
    setUnlockedKey(key)
    return key
  }, [state.accounts, state.activeIndex])

  const unlockAt = useCallback(async (index: number, password: string): Promise<string> => {
    const account = state.accounts[index]
    if (!account) throw new Error('Account not found')
    return decryptPrivateKey(account.encrypted, password)
  }, [state.accounts])

  const lock = useCallback(() => { setUnlockedKey(null) }, [])

  const minerIndex = state.accounts.findIndex(a => a.isMiner)

  return {
    accounts: state.accounts,
    activeAccount: state.activeIndex >= 0 ? state.accounts[state.activeIndex] : null,
    activeIndex: state.activeIndex,
    minerAccount: minerIndex >= 0 ? state.accounts[minerIndex] : null,
    minerIndex,
    setActiveIndex,
    createAccount,
    createMinerAccount,
    importAccount,
    deleteAccount,
    unlock,
    unlockAt,
    locked: unlockedKey === null,
    lock,
  }
}

export const WalletProvider = WalletContext.Provider

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
