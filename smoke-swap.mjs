// Cross-chain swap smoke test against local devnet at 127.0.0.1:8080.
// Runs a self-swap on a fresh keypair: the miner transfers funds to the
// test account on both Nexus and the child chain first, then the test
// account executes deposit -> receipt -> withdrawal. Using a fresh
// keypair avoids a race with the miner's per-block coinbase tx, whose
// nonce advance would otherwise evict the test tx from the mempool as
// stale.

import * as secp from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

secp.etc.hmacSha256Sync = (key, ...msgs) =>
  hmac(sha256, key, secp.etc.concatBytes(...msgs))

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'
function base32Encode(bytes) {
  let bits = 0, value = 0, out = ''
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]
    bits += 8
    while (bits >= 5) { bits -= 5; out += BASE32[(value >>> bits) & 0x1f] }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 0x1f]
  return out
}
function computeAddress(publicKeyHex) {
  const json = `{"key":"${publicKeyHex}"}`
  const digest = sha256(new TextEncoder().encode(json))
  const cidBytes = new Uint8Array(5 + digest.length)
  cidBytes[0] = 0x01; cidBytes[1] = 0xa9; cidBytes[2] = 0x02
  cidBytes[3] = 0x12; cidBytes[4] = 0x20
  cidBytes.set(digest, 5)
  return 'b' + base32Encode(cidBytes)
}
function sign(message, privateKeyHex) {
  const digest = sha256(new TextEncoder().encode(message))
  const sig = secp.sign(digest, hexToBytes(privateKeyHex))
  return bytesToHex(sig.toCompactRawBytes())
}

const BASE = 'http://127.0.0.1:8080'

async function rpc(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text } }
  return { ok: res.ok, status: res.status, json }
}

async function getNonce(addr, chain) {
  const r = await rpc('GET', `/api/nonce/${addr}?chain=${chain}`)
  if (!r.ok) throw new Error(`nonce failed: ${JSON.stringify(r.json)}`)
  return r.json.nonce
}
async function getBalance(addr, chain) {
  const r = await rpc('GET', `/api/balance/${addr}?chain=${chain}`)
  if (!r.ok) throw new Error(`balance failed: ${JSON.stringify(r.json)}`)
  return r.json.balance
}
async function getDeposit(demander, amount, nonceHex, chain) {
  const r = await rpc('GET', `/api/deposit?demander=${demander}&amount=${amount}&nonce=${nonceHex}&chain=${chain}`)
  return r.json
}
async function getReceipt(demander, amount, nonceHex, directory) {
  const r = await rpc('GET', `/api/receipt-state?demander=${demander}&amount=${amount}&nonce=${nonceHex}&directory=${directory}`)
  return r.json
}

async function submit(body, chain, privateKey, publicKey) {
  const prep = await rpc('POST', '/api/transaction/prepare', body)
  if (!prep.ok) throw new Error(`prepare failed: ${JSON.stringify(prep.json)}`)
  const signature = sign(prep.json.bodyCID, privateKey)
  const sub = await rpc('POST', '/api/transaction', {
    signatures: { [publicKey]: signature },
    bodyCID: prep.json.bodyCID,
    bodyData: prep.json.bodyData,
    chain,
  })
  return { prepared: prep.json, submit: sub.json, ok: sub.ok }
}

async function waitForHeight(chain, minHeight, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await rpc('GET', `/api/chain/info`)
    const c = r.json.chains.find(c => c.directory === chain)
    if (c && c.height >= minHeight) return c.height
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`timed out waiting for ${chain} to reach height ${minHeight}`)
}

async function pollUntil(fn, desc, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await fn()
    if (r) return r
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`timed out: ${desc}`)
}

const IDENTITY = JSON.parse(readFileSync(`${homedir()}/.lattice/identity.json`, 'utf8'))
const minerPublicKey = IDENTITY.publicKey
const minerPrivateKey = IDENTITY.privateKey
const minerAddr = computeAddress(minerPublicKey)

// Fresh test keypair — avoids racing with miner's coinbase nonce updates.
import { randomBytes } from 'node:crypto'
const userPrivBytes = new Uint8Array(randomBytes(32))
const privateKey = bytesToHex(userPrivBytes)
const publicKey = bytesToHex(secp.getPublicKey(userPrivBytes, true))
const addr = computeAddress(publicKey)

console.log('=== cross-chain swap smoke test ===')
console.log(`miner address: ${minerAddr}`)
console.log(`user address:  ${addr}`)

// Pick child chain with the highest mining throughput (so we don't wait long)
const chainInfo = await rpc('GET', '/api/chain/info')
console.log(`chains: ${chainInfo.json.chains.map(c => `${c.directory}@${c.height}`).join(', ')}`)
const childChain = 'FastTest'
const nexusDir = chainInfo.json.nexus

const minerNexusBal = await getBalance(minerAddr, nexusDir)
const minerChildBal = await getBalance(minerAddr, childChain)
console.log(`\nminer balances  Nexus=${minerNexusBal}  ${childChain}=${minerChildBal}`)

const fundAmount = 5000
if (minerChildBal < fundAmount + 100) {
  console.error(`Insufficient miner ${childChain} balance (${minerChildBal}) to fund test`)
  process.exit(1)
}
if (minerNexusBal < fundAmount + 100) {
  console.error(`Insufficient miner Nexus balance (${minerNexusBal}) to fund test`)
  process.exit(1)
}

// Fund the test account from miner. The miner's own nonce ratchets every
// block via its coinbase, so a miner-signed tx submitted while mining races
// with the next block: the mempool's batchUpdateConfirmedNonces evicts our
// entry as stale as soon as the next coinbase-only block applies. Pause
// mining while we stage the fund txs, then resume — the miner's first
// selectTransactions after resume will pick them up deterministically.
async function stopMining(chain) {
  const r = await rpc('POST', '/api/mining/stop', { chain })
  if (!r.ok) throw new Error(`stop mining ${chain} failed: ${JSON.stringify(r.json)}`)
}
async function startMining(chain) {
  const r = await rpc('POST', '/api/mining/start', { chain })
  if (!r.ok) throw new Error(`start mining ${chain} failed: ${JSON.stringify(r.json)}`)
}
async function stageFund(chain, chainPath) {
  const n = await getNonce(minerAddr, chain)
  const r = await submit({
    chainPath,
    nonce: n,
    signers: [minerAddr],
    fee: 1,
    accountActions: [
      { owner: minerAddr, delta: -(fundAmount + 1) },
      { owner: addr, delta: fundAmount },
    ],
  }, chain, minerPrivateKey, minerPublicKey)
  if (!r.ok) throw new Error(`fund ${chain} failed: ${JSON.stringify(r.submit)}`)
  console.log(`  staged ${chain}: tx=${r.submit.txCID.slice(0, 20)}... nonce=${n}`)
}

console.log(`\npausing mining to stage fund txs (avoids coinbase nonce race)`)
// Stopping Nexus mining pauses all merged-mining (child chains ride along).
await stopMining(nexusDir)
await new Promise(r => setTimeout(r, 500)) // let any in-flight block submit finish

console.log(`staging fund txs (${fundAmount} on each chain)...`)
await stageFund(nexusDir, [nexusDir])
await stageFund(childChain, [nexusDir, childChain])

console.log(`resuming mining`)
await startMining(nexusDir)

console.log(`waiting for fund inclusion...`)
await pollUntil(async () => (await getBalance(addr, nexusDir)) >= fundAmount ? true : null,
  'user Nexus balance funded', 45000)
await pollUntil(async () => (await getBalance(addr, childChain)) >= fundAmount ? true : null,
  `user ${childChain} balance funded`, 45000)

const nexusBal0 = await getBalance(addr, nexusDir)
const childBal0 = await getBalance(addr, childChain)
console.log(`user balances  Nexus=${nexusBal0}  ${childChain}=${childBal0}`)

// Make the swap nonce unique per run
const swapNonceHex = Date.now().toString(16).padStart(32, '0').slice(-32)
const amount = 500
const fee = 1
console.log(`\nswap: amount=${amount} swapNonce=0x${swapNonceHex} fee=${fee}/tx`)

// Step 1: Deposit on child chain
const depNonce = await getNonce(addr, childChain)
console.log(`\n[1/3] Deposit on ${childChain} (acct nonce=${depNonce})`)
const depResult = await submit({
  chainPath: [nexusDir, childChain],
  nonce: depNonce,
  signers: [addr],
  fee,
  accountActions: [{ owner: addr, delta: -(amount + fee) }],
  depositActions: [{ nonce: swapNonceHex, demander: addr, amountDemanded: amount, amountDeposited: amount }],
}, childChain, privateKey, publicKey)
console.log('  submit:', depResult.submit)
if (!depResult.ok) process.exit(1)

// Wait for deposit to appear in state
console.log(`  waiting for deposit state...`)
const depState = await pollUntil(async () => {
  const r = await getDeposit(addr, amount, swapNonceHex, childChain)
  return r.exists ? r : null
}, 'deposit state visible', 45000)
console.log(`  ✓ deposit in state: amountDeposited=${depState.amountDeposited}`)

// Step 2: Receipt on nexus
const recNonce = await getNonce(addr, nexusDir)
console.log(`\n[2/3] Receipt on ${nexusDir} (acct nonce=${recNonce})`)
const recResult = await submit({
  chainPath: [nexusDir],
  nonce: recNonce,
  signers: [addr],
  fee,
  accountActions: [{ owner: addr, delta: -fee }],
  receiptActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded: amount, directory: childChain }],
}, nexusDir, privateKey, publicKey)
console.log('  submit:', recResult.submit)
if (!recResult.ok) process.exit(1)

// Wait for receipt state
console.log(`  waiting for receipt state...`)
const recState = await pollUntil(async () => {
  const r = await getReceipt(addr, amount, swapNonceHex, childChain)
  return r.exists ? r : null
}, 'receipt state visible', 45000)
console.log(`  ✓ receipt in state: withdrawer=${recState.withdrawer?.slice(0, 20)}...`)

// Step 3: Withdrawal on child
const wdNonce = await getNonce(addr, childChain)
console.log(`\n[3/3] Withdrawal on ${childChain} (acct nonce=${wdNonce})`)
const wdResult = await submit({
  chainPath: [nexusDir, childChain],
  nonce: wdNonce,
  signers: [addr],
  fee,
  accountActions: [{ owner: addr, delta: amount - fee }],
  withdrawalActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded: amount, amountWithdrawn: amount }],
}, childChain, privateKey, publicKey)
console.log('  submit:', wdResult.submit)
if (!wdResult.ok) process.exit(1)

// Wait for the deposit to be consumed (no longer in state)
console.log(`  waiting for deposit to be consumed...`)
await pollUntil(async () => {
  const r = await getDeposit(addr, amount, swapNonceHex, childChain)
  return r.exists ? null : true
}, 'deposit consumed', 45000)
console.log(`  ✓ deposit consumed (withdrawal settled)`)

// Give a block for account state to settle, then check balances
await new Promise(r => setTimeout(r, 3000))
const nexusBal1 = await getBalance(addr, nexusDir)
const childBal1 = await getBalance(addr, childChain)

console.log(`\n=== RESULTS ===`)
console.log(`Nexus     before=${nexusBal0}  after=${nexusBal1}  delta=${nexusBal1 - nexusBal0}  (also receiving block rewards — ignore exact)`)
console.log(`${childChain}  before=${childBal0}  after=${childBal1}  delta=${childBal1 - childBal0}  (also receiving block rewards — ignore exact)`)
console.log(`\n✓ Full deposit -> receipt -> withdrawal cycle completed on v7.9.3`)
console.log(`  - deposit state was populated and consumed`)
console.log(`  - receipt state was populated on nexus`)
console.log(`  - all three transactions were accepted by RPC and included in blocks`)
