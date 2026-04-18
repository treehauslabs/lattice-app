const STORAGE_KEY = 'lattice_keystore'
const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 32
const IV_BYTES = 12

export interface StoredAccount {
  name: string
  publicKey: string
  address: string
  encrypted: string  // hex(salt + iv + ciphertext + tag)
  createdAt: number
  isMiner?: boolean
}

export interface KeystoreState {
  accounts: StoredAccount[]
  activeIndex: number
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptPrivateKey(privateKeyHex: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    hexToBytes(privateKeyHex)
  )
  const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  result.set(salt, 0)
  result.set(iv, salt.length)
  result.set(new Uint8Array(ciphertext), salt.length + iv.length)
  return bytesToHex(result)
}

export async function decryptPrivateKey(encrypted: string, password: string): Promise<string> {
  const data = hexToBytes(encrypted)
  const salt = data.slice(0, SALT_BYTES)
  const iv = data.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const ciphertext = data.slice(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(password, salt)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return bytesToHex(new Uint8Array(plaintext))
}

export function loadKeystore(): KeystoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { accounts: [], activeIndex: -1 }
    return JSON.parse(raw)
  } catch {
    return { accounts: [], activeIndex: -1 }
  }
}

export function saveKeystore(state: KeystoreState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function addAccount(state: KeystoreState, account: StoredAccount): KeystoreState {
  const accounts = [...state.accounts, account]
  const activeIndex = state.activeIndex < 0 ? 0 : state.activeIndex
  return { accounts, activeIndex }
}

export function removeAccount(state: KeystoreState, index: number): KeystoreState {
  const accounts = state.accounts.filter((_, i) => i !== index)
  let activeIndex = state.activeIndex
  if (index === activeIndex) activeIndex = accounts.length > 0 ? 0 : -1
  else if (index < activeIndex) activeIndex--
  return { accounts, activeIndex }
}
