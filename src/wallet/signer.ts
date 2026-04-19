import * as secp from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

// @noble/secp256k1 v2 ships sign() as sync-capable but requires the consumer
// to wire in an HMAC-SHA256 impl. Without this, sign() throws
// "hashes.hmacSha256Sync not set" the first time it's called.
secp.etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) =>
  hmac(sha256, key, secp.etc.concatBytes(...msgs))

export { bytesToHex, hexToBytes }

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f]
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }
  return output
}

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

// Match Swift P256K.Signing.PrivateKey.signature(for: Data):
// per P256K docs, the DataProtocol overload hashes with SHA-256 before signing.
// Swift verify on the node does the same. @noble/secp256k1 v2 `sign()` expects a
// 32-byte hash (and silently truncates longer inputs), so we MUST pre-hash here
// or signatures will be rejected by Transaction.signaturesAreValid().
export function sign(message: string, privateKeyHex: string): string {
  const digest = sha256(new TextEncoder().encode(message))
  const signature = secp.sign(digest, hexToBytes(privateKeyHex))
  return bytesToHex(signature.toCompactRawBytes())
}

export function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const digest = sha256(new TextEncoder().encode(message))
    const sig = secp.Signature.fromCompact(hexToBytes(signatureHex))
    return secp.verify(sig, digest, hexToBytes(publicKeyHex))
  } catch {
    return false
  }
}

// Miner on-chain address matches MinerIdentity.swift:
//   HeaderImpl<PublicKey>(node: PublicKey(key: publicKeyHex)).rawCID
// Node.toData() (protocol extension) wins over PublicKey.toData() via static
// dispatch, so the hashed bytes are the dag-json encoding of the struct:
//   {"key":"<publicKeyHex>"}  (JSONEncoder with .sortedKeys)
// That sha256 digest becomes a CIDv1(dag-json 0x0129) base32-encoded with the
// 'b' multibase prefix.
export function computeAddress(publicKeyHex: string): string {
  const json = `{"key":"${publicKeyHex}"}`
  const digest = sha256(new TextEncoder().encode(json))
  const cidBytes = new Uint8Array(5 + digest.length)
  cidBytes[0] = 0x01
  cidBytes[1] = 0xa9
  cidBytes[2] = 0x02
  cidBytes[3] = 0x12
  cidBytes[4] = 0x20
  cidBytes.set(digest, 5)
  return 'b' + base32Encode(cidBytes)
}
