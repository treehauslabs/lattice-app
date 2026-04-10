import * as secp from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

export { bytesToHex, hexToBytes }

export function generateKeyPair(): { privateKey: string; publicKey: string } {
  const privateKeyBytes = secp.utils.randomPrivateKey()
  const publicKeyBytes = secp.getPublicKey(privateKeyBytes, true) // compressed 33 bytes
  return {
    privateKey: bytesToHex(privateKeyBytes),
    publicKey: bytesToHex(publicKeyBytes),
  }
}

export function publicKeyFromPrivate(privateKeyHex: string): string {
  const publicKeyBytes = secp.getPublicKey(hexToBytes(privateKeyHex), true)
  return bytesToHex(publicKeyBytes)
}

export function sign(message: string, privateKeyHex: string): string {
  const messageBytes = new TextEncoder().encode(message)
  const signature = secp.sign(messageBytes, hexToBytes(privateKeyHex))
  return bytesToHex(signature.toCompactRawBytes())
}

export function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message)
    const sig = secp.Signature.fromCompact(hexToBytes(signatureHex))
    return secp.verify(sig, messageBytes, hexToBytes(publicKeyHex))
  } catch {
    return false
  }
}

export function computeAddress(publicKeyHex: string): string {
  const publicKeyBytes = hexToBytes(publicKeyHex)
  const hash = sha256(publicKeyBytes)
  return bytesToHex(hash)
}
