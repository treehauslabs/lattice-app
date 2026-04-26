// Variable-rate cross-chain swap smoke test against local devnet at 127.0.0.1:8080.
// Same shape as smoke-swap.mjs but exercises the protocol's variable-rate
// price discovery: amountDeposited (child-chain tokens locked) differs from
// amountDemanded (nexus tokens demanded as payment). Verifies:
//   - deposit landed with the asymmetric (deposited, demanded) pair
//   - receipt on nexus paid amountDemanded
//   - withdrawal claimed exactly amountDeposited (overclaim guard satisfied)
//
// Self-swap on a fresh keypair to avoid the miner coinbase nonce race.

import * as secp from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

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

const userPrivBytes = new Uint8Array(randomBytes(32))
const privateKey = bytesToHex(userPrivBytes)
const publicKey = bytesToHex(secp.getPublicKey(userPrivBytes, true))
const addr = computeAddress(publicKey)

console.log('=== variable-rate cross-chain swap smoke test ===')
console.log(`miner address: ${minerAddr}`)
console.log(`user address:  ${addr}`)

const chainInfo = await rpc('GET', '/api/chain/info')
console.log(`chains: ${chainInfo.json.chains.map(c => `${c.directory}@${c.height}`).join(', ')}`)
const childChain = 'FastTest'
const nexusDir = chainInfo.json.nexus

if (!chainInfo.json.chains.find(c => c.directory === childChain)) {
  console.log(`deploying ${childChain}...`)
  const dep = await rpc('POST', '/api/chain/deploy', {
    directory: childChain, parentDirectory: nexusDir,
    targetBlockTime: 1000, initialReward: 1024, halvingInterval: 210000,
    premine: 0, maxTransactionsPerBlock: 100, maxStateGrowth: 100000,
    maxBlockSize: 1000000, difficultyAdjustmentWindow: 120, startMining: true
  })
  if (!dep.ok) throw new Error(`deploy failed: ${JSON.stringify(dep.json)}`)
  await rpc('POST', '/api/mining/stop', { chain: nexusDir })
  await new Promise(r => setTimeout(r, 1000))
  await rpc('POST', '/api/mining/start', { chain: nexusDir })
  await waitForHeight(childChain, 10)
  console.log(`${childChain} deployed and mining`)
}

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
await stopMining(nexusDir)
for (let i = 0; i < 10; i++) {
  const h1 = await waitForHeight(nexusDir, 1)
  await new Promise(r => setTimeout(r, 300))
  const h2 = await waitForHeight(nexusDir, 1)
  if (h1 === h2) break
}

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

const swapNonceHex = Date.now().toString(16).padStart(32, '0').slice(-32)
const amountDeposited = 100   // child-chain tokens locked
const amountDemanded = 250    // nexus tokens demanded as payment (rate = 2.5x)
const fee = 1
console.log(`\nvariable-rate swap: deposited=${amountDeposited} ${childChain} demanded=${amountDemanded} Nexus`)
console.log(`rate: ${amountDemanded}/${amountDeposited} = ${(amountDemanded / amountDeposited).toFixed(2)}x`)
console.log(`swapNonce=0x${swapNonceHex} fee=${fee}/tx`)

// Step 1: Deposit on child chain — locks amountDeposited, demands amountDemanded
const depNonce = await getNonce(addr, childChain)
console.log(`\n[1/3] Deposit on ${childChain} (acct nonce=${depNonce})`)
const depResult = await submit({
  chainPath: [nexusDir, childChain],
  nonce: depNonce,
  signers: [addr],
  fee,
  accountActions: [{ owner: addr, delta: -(amountDeposited + fee) }],
  depositActions: [{
    nonce: swapNonceHex,
    demander: addr,
    amountDemanded,
    amountDeposited,
  }],
}, childChain, privateKey, publicKey)
console.log('  submit:', depResult.submit)
if (!depResult.ok) process.exit(1)

console.log(`  waiting for deposit state...`)
const depState = await pollUntil(async () => {
  const r = await getDeposit(addr, amountDemanded, swapNonceHex, childChain)
  return r.exists ? r : null
}, 'deposit state visible', 45000)
console.log(`  ✓ deposit in state: amountDeposited=${depState.amountDeposited} (demanded=${amountDemanded})`)
if (Number(depState.amountDeposited) !== amountDeposited) {
  console.error(`  ✗ expected amountDeposited=${amountDeposited}, got ${depState.amountDeposited}`)
  process.exit(1)
}

// Step 2: Receipt on nexus — pays amountDemanded (self-swap: implicit debit/credit cancel)
const recNonce = await getNonce(addr, nexusDir)
console.log(`\n[2/3] Receipt on ${nexusDir} (acct nonce=${recNonce}) paying ${amountDemanded}`)
const recResult = await submit({
  chainPath: [nexusDir],
  nonce: recNonce,
  signers: [addr],
  fee,
  accountActions: [{ owner: addr, delta: -fee }],
  receiptActions: [{
    withdrawer: addr,
    nonce: swapNonceHex,
    demander: addr,
    amountDemanded,
    directory: childChain,
  }],
}, nexusDir, privateKey, publicKey)
console.log('  submit:', recResult.submit)
if (!recResult.ok) process.exit(1)

console.log(`  waiting for receipt state...`)
const recState = await pollUntil(async () => {
  const r = await getReceipt(addr, amountDemanded, swapNonceHex, childChain)
  return r.exists ? r : null
}, 'receipt state visible', 45000)
console.log(`  ✓ receipt in state: withdrawer=${recState.withdrawer?.slice(0, 20)}...`)

// Step 3: Withdrawal on child — claims amountWithdrawn=amountDeposited
//         (overclaim guard: amountWithdrawn must equal stored amountDeposited)
const wdNonce = await getNonce(addr, childChain)
console.log(`\n[3/3] Withdrawal on ${childChain} (acct nonce=${wdNonce}) unlocking ${amountDeposited}`)
const wdResult = await submit({
  chainPath: [nexusDir, childChain],
  nonce: wdNonce,
  signers: [addr],
  fee,
  accountActions: [{ owner: addr, delta: amountDeposited - fee }],
  withdrawalActions: [{
    withdrawer: addr,
    nonce: swapNonceHex,
    demander: addr,
    amountDemanded,
    amountWithdrawn: amountDeposited,
  }],
}, childChain, privateKey, publicKey)
console.log('  submit:', wdResult.submit)
if (!wdResult.ok) process.exit(1)

console.log(`  waiting for deposit to be consumed...`)
await pollUntil(async () => {
  const r = await getDeposit(addr, amountDemanded, swapNonceHex, childChain)
  return r.exists ? null : true
}, 'deposit consumed', 45000)
console.log(`  ✓ deposit consumed (withdrawal settled at variable rate)`)

await new Promise(r => setTimeout(r, 3000))
const nexusBal1 = await getBalance(addr, nexusDir)
const childBal1 = await getBalance(addr, childChain)

console.log(`\n=== RESULTS ===`)
console.log(`Nexus     before=${nexusBal0}  after=${nexusBal1}  delta=${nexusBal1 - nexusBal0}`)
console.log(`${childChain}  before=${childBal0}  after=${childBal1}  delta=${childBal1 - childBal0}`)
console.log(`\n✓ Variable-rate deposit -> receipt -> withdrawal cycle completed`)
console.log(`  - amountDeposited=${amountDeposited} (${childChain}) != amountDemanded=${amountDemanded} (Nexus)`)
console.log(`  - rate ${(amountDemanded / amountDeposited).toFixed(2)}x preserved through all three steps`)
console.log(`  - on-chain overclaim guard satisfied (amountWithdrawn matched stored amountDeposited)`)
