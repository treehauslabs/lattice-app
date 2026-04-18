// Parser for the node CLI's `identity.json` file (see
// lattice-node/Sources/LatticeNode/CLI/Identity.swift). The file is either
// plaintext (privateKey field set) or encrypted via HKDF<SHA256> + AES-GCM
// with info="lattice-identity" and nonce = salt.prefix(12).

interface IdentityFile {
  publicKey: string
  privateKey?: string | null
  encryptedPrivateKey?: string | null
  salt?: string | null
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new Error('Invalid hex string')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  }
  return out
}

async function decryptIdentityKey(encryptedHex: string, saltHex: string, password: string): Promise<string> {
  const combined = hexToBytes(encryptedHex)
  const salt = hexToBytes(saltHex)
  if (combined.length < 12 + 16) throw new Error('Encrypted blob too short')

  const iv = salt.slice(0, 12)
  const ctAndTag = combined.slice(12)

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'HKDF',
    false,
    ['deriveBits']
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('lattice-identity'),
    },
    passwordKey,
    256
  )
  const aesKey = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ctAndTag
  )
  return new TextDecoder().decode(plaintext)
}

export interface ParsedIdentity {
  publicKey: string
  privateKey: string
}

export async function parseIdentityFile(contents: string, nodePassword?: string): Promise<ParsedIdentity> {
  let parsed: IdentityFile
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error('Not valid JSON')
  }
  if (!parsed.publicKey) throw new Error('Missing publicKey in identity.json')

  if (parsed.privateKey) {
    if (!/^[0-9a-fA-F]{64}$/.test(parsed.privateKey)) {
      throw new Error('privateKey is not 64 hex chars')
    }
    return { publicKey: parsed.publicKey, privateKey: parsed.privateKey.toLowerCase() }
  }

  if (parsed.encryptedPrivateKey && parsed.salt) {
    if (!nodePassword) throw new Error('Node identity password required')
    const privateKey = await decryptIdentityKey(parsed.encryptedPrivateKey, parsed.salt, nodePassword)
    if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('Decrypted key is not 64 hex chars — wrong password?')
    }
    return { publicKey: parsed.publicKey, privateKey: privateKey.toLowerCase() }
  }

  throw new Error('identity.json has neither privateKey nor encryptedPrivateKey')
}
