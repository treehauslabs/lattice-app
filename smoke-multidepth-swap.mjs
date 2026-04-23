// Multi-depth cross-chain swap smoke test.
//
// Deploys a tree with multiple branches and depths:
//
//     Nexus ─┬─ ChainB ── ChainD
//            └─ ChainC ── ChainE ── ChainG
//
// and runs swap cycles at every non-leaf source/receipt-chain combination:
//
//   * cycle on ChainD  (receipt on ChainB, a depth-1 receipt chain)
//   * cycle on ChainE  (receipt on ChainC, a depth-1 receipt chain)
//   * cycle on ChainG  (receipt on ChainE, a depth-2 receipt chain)  ← deepest
//   * cycle on ChainB  (receipt on Nexus,  depth-0 receipt chain)
//   * cycle on ChainC  (receipt on Nexus,  depth-0 receipt chain)
//
// Exercises the tree-walk in `withdrawalsAreValid` and `getReceipt` against
// receipt chains at arbitrary depths on arbitrary branches.

import * as secp from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { readFileSync } from 'node:fs'
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

const BASE = process.env.LATTICE_RPC || 'http://127.0.0.1:8081'
const DATA_DIR = process.env.LATTICE_DATA_DIR || '/tmp/smoke-multidepth'

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

async function waitForHeight(chain, minHeight, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await rpc('GET', `/api/chain/info`)
    const c = r.json.chains?.find(c => c.directory === chain)
    if (c && c.height >= minHeight) return c.height
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`timed out waiting for ${chain} to reach height ${minHeight}`)
}

async function pollUntil(fn, desc, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await fn()
    if (r) return r
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`timed out: ${desc}`)
}

async function stopMining(chain) {
  const r = await rpc('POST', '/api/mining/stop', { chain })
  if (!r.ok) throw new Error(`stop mining ${chain} failed: ${JSON.stringify(r.json)}`)
}
async function startMining(chain) {
  const r = await rpc('POST', '/api/mining/start', { chain })
  if (!r.ok) throw new Error(`start mining ${chain} failed: ${JSON.stringify(r.json)}`)
}

const IDENTITY = JSON.parse(readFileSync(`${DATA_DIR}/identity.json`, 'utf8'))
const minerPublicKey = IDENTITY.publicKey
const minerPrivateKey = IDENTITY.privateKey
const minerAddr = computeAddress(minerPublicKey)

const userPrivBytes = new Uint8Array(randomBytes(32))
const privateKey = bytesToHex(userPrivBytes)
const publicKey = bytesToHex(secp.getPublicKey(userPrivBytes, true))
const addr = computeAddress(publicKey)

console.log('=== multi-depth cross-chain swap smoke test ===')
console.log(`miner address: ${minerAddr}`)
console.log(`user address:  ${addr}`)
console.log(`RPC:           ${BASE}`)

const initialInfo = await rpc('GET', '/api/chain/info')
const NEXUS = initialInfo.json.nexus
const B = 'ChainB'
const C = 'ChainC'
const D = 'ChainD'
const E = 'ChainE'
const G = 'ChainG'

console.log(`initial chains: ${initialInfo.json.chains.map(c => `${c.directory}@${c.height}`).join(', ')}`)

// chainPath for each chain, used when submitting transactions.
const PATH = {
  [NEXUS]: [NEXUS],
  [B]: [NEXUS, B],
  [C]: [NEXUS, C],
  [D]: [NEXUS, B, D],
  [E]: [NEXUS, C, E],
  [G]: [NEXUS, C, E, G],
}

// parent(X) for each chain, used to target the receipt chain.
const PARENT = {
  [B]: NEXUS,
  [C]: NEXUS,
  [D]: B,
  [E]: C,
  [G]: E,
}

async function deployChain(directory, parentDirectory) {
  const existing = initialInfo.json.chains.find(c => c.directory === directory)
  if (existing) {
    console.log(`  (${directory} already exists, skipping deploy)`)
    return
  }
  const r = await rpc('POST', '/api/chain/deploy', {
    directory,
    parentDirectory,
    targetBlockTime: 2,
    initialReward: 100,
    halvingInterval: 10000,
    premine: 100,
    maxTransactionsPerBlock: 100,
    maxStateGrowth: 1_000_000,
    maxBlockSize: 1_000_000,
    difficultyAdjustmentWindow: 10,
    transactionFilters: [],
    actionFilters: [],
    premineRecipient: minerAddr,
    startMining: true,
    minerPublicKey,
    minerPrivateKey,
  })
  if (!r.ok) throw new Error(`deploy ${directory}/${parentDirectory} failed: ${JSON.stringify(r.json)}`)
  console.log(`  deployed ${directory} (parent=${parentDirectory}) genesis=${r.json.genesisHash.slice(0, 20)}... mining=${r.json.mining}`)
}

console.log(`\n[A] Deploying ${B} and ${C} as children of ${NEXUS}...`)
await deployChain(B, NEXUS)
await deployChain(C, NEXUS)

console.log(`\n[B] Deploying ${D} under ${B}, and ${E} under ${C}...`)
await deployChain(D, B)
await deployChain(E, C)

console.log(`\n[C] Deploying ${G} as a depth-3 grandchild under ${E}...`)
await deployChain(G, E)

console.log(`\n[D] Verifying chain topology...`)
const postDeployInfo = await rpc('GET', '/api/chain/info')
const byDir = Object.fromEntries(postDeployInfo.json.chains.map(c => [c.directory, c]))
const expectedParents = [
  [B, NEXUS], [C, NEXUS], [D, B], [E, C], [G, E],
]
for (const [dir, expectedParent] of expectedParents) {
  const c = byDir[dir]
  if (!c) throw new Error(`chain ${dir} not present in /api/chain/info after deploy`)
  if (c.parentDirectory !== expectedParent) {
    throw new Error(`chain ${dir}: expected parentDirectory=${expectedParent}, got ${c.parentDirectory}`)
  }
  console.log(`  ✓ ${dir}.parentDirectory = ${c.parentDirectory}`)
}

console.log(`\n[E] Waiting for all chains to mine blocks...`)
for (const dir of [B, C, D, E, G]) {
  await waitForHeight(dir, 3, 90000)
}
const heights = (await rpc('GET', '/api/chain/info')).json.chains
console.log(`  heights: ${heights.map(c => `${c.directory}@${c.height}`).join(', ')}`)

const fundAmount = 5000
for (const dir of [NEXUS, B, C, D, E, G]) {
  const bal = await getBalance(minerAddr, dir)
  if (bal < fundAmount + 100) {
    throw new Error(`Insufficient miner balance on ${dir}: ${bal} < ${fundAmount + 100}`)
  }
}

async function stageFund(chain) {
  const chainPath = PATH[chain]
  for (let attempt = 0; attempt < 6; attempt++) {
    const base = await getNonce(minerAddr, chain)
    for (const n of [base, base + 1]) {
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
      if (r.ok) {
        console.log(`  staged fund ${chain}: tx=${r.submit.txCID.slice(0, 20)}... nonce=${n}`)
        return
      }
      const msg = JSON.stringify(r.submit)
      if (!msg.includes('Nonce already used') && !msg.includes('future')) {
        throw new Error(`fund ${chain} failed: ${msg}`)
      }
    }
    await new Promise(res => setTimeout(res, 500))
  }
  throw new Error(`fund ${chain} failed after retries`)
}

console.log(`\n[F] Pausing mining to stage fund txs...`)
await stopMining(NEXUS) // merge-mining: stopping nexus pauses all descendants
async function waitForHeightStable() {
  let last = null
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500))
    const info = (await rpc('GET', '/api/chain/info')).json.chains
    const snap = info.map(c => `${c.directory}@${c.height}`).sort().join(',')
    if (last === snap) {
      console.log(`  heights stable: ${snap}`)
      return
    }
    last = snap
  }
  throw new Error('heights never stabilized after stopMining')
}
await waitForHeightStable()

console.log(`\n[G] Funding user on ${NEXUS}, ${B}, ${C}, ${D}, ${E}, ${G}...`)
for (const dir of [NEXUS, B, C, D, E, G]) {
  await stageFund(dir)
}

console.log(`\n[H] Resuming mining; waiting for fund inclusion...`)
await startMining(NEXUS)
for (const dir of [NEXUS, B, C, D, E, G]) {
  await pollUntil(async () => (await getBalance(addr, dir)) >= fundAmount ? true : null, `user ${dir} funded`, 90000)
}

const before = {}
for (const dir of [NEXUS, B, C, D, E, G]) {
  before[dir] = await getBalance(addr, dir)
}
console.log(`  user balances: ${Object.entries(before).map(([k,v]) => `${k}=${v}`).join(' ')}`)

// Track the next-expected nonce per chain locally since getNonce returns
// "last used" (0 for fresh senders is ambiguous with unset).
const nextNonce = { [NEXUS]: 0, [B]: 0, [C]: 0, [D]: 0, [E]: 0, [G]: 0 }

// Generic swap cycle: deposit on `source`, receipt on parent(source), withdrawal on `source`.
async function runCycle(source, label) {
  const receiptChain = PARENT[source]
  const swapNonceHex = (Date.now() + Math.floor(Math.random() * 1e9)).toString(16).padStart(32, '0').slice(-32)
  const amount = 500
  const fee = 1
  console.log(`  [${label}] source=${source} receiptChain=${receiptChain} amount=${amount} swapNonce=0x${swapNonceHex.slice(0, 12)}...`)

  // 1. Deposit on source
  const depNonce = nextNonce[source]++
  const depResult = await submit({
    chainPath: PATH[source],
    nonce: depNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: -(amount + fee) }],
    depositActions: [{ nonce: swapNonceHex, demander: addr, amountDemanded: amount, amountDeposited: amount }],
  }, source, privateKey, publicKey)
  if (!depResult.ok) throw new Error(`deposit on ${source} failed: ${JSON.stringify(depResult.submit)}`)
  await pollUntil(async () => {
    const r = await getDeposit(addr, amount, swapNonceHex, source)
    return r.exists ? r : null
  }, `deposit visible on ${source}`, 60000)

  // 2. Receipt on parent(source)
  const recNonce = nextNonce[receiptChain]++
  const recResult = await submit({
    chainPath: PATH[receiptChain],
    nonce: recNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: -fee }],
    receiptActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded: amount, directory: source }],
  }, receiptChain, privateKey, publicKey)
  if (!recResult.ok) throw new Error(`receipt on ${receiptChain} failed: ${JSON.stringify(recResult.submit)}`)
  await pollUntil(async () => {
    const r = await getReceipt(addr, amount, swapNonceHex, source)
    return r.exists ? r : null
  }, `receipt visible for ${source} (on ${receiptChain})`, 60000)

  // 3. Withdrawal on source
  const wdNonce = nextNonce[source]++
  const wdResult = await submit({
    chainPath: PATH[source],
    nonce: wdNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: amount - fee }],
    withdrawalActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded: amount, amountWithdrawn: amount }],
  }, source, privateKey, publicKey)
  if (!wdResult.ok) throw new Error(`withdrawal on ${source} failed: ${JSON.stringify(wdResult.submit)}`)
  await pollUntil(async () => {
    const r = await getDeposit(addr, amount, swapNonceHex, source)
    return r.exists ? null : true
  }, `deposit consumed on ${source}`, 60000)

  console.log(`    ✓ cycle ${label} complete (deposit on ${source} → receipt on ${receiptChain} → withdrawal on ${source})`)
}

// Each swap cycle debits 2 units on the source chain (deposit fee + withdrawal fee)
// and 1 unit on the receipt chain (receipt fee). The receipt's implicit account
// transfers debit-then-credit the same address (addr), so they net to zero.
const expectedSourceDelta = {}
const expectedReceiptDelta = {}

function recordCycle(source) {
  const receiptChain = PARENT[source]
  expectedSourceDelta[source] = (expectedSourceDelta[source] || 0) - 2
  expectedReceiptDelta[receiptChain] = (expectedReceiptDelta[receiptChain] || 0) - 1
}

console.log(`\n[I] Running swap cycles at every source/receipt-chain depth combo...`)

// Depth-1 source, depth-0 receipt chain (baseline — same as smoke-swap).
await runCycle(B, 'cycle-B-on-Nexus')
recordCycle(B)
await runCycle(C, 'cycle-C-on-Nexus')
recordCycle(C)

// Depth-2 source, depth-1 receipt chain.
await runCycle(D, 'cycle-D-on-B')
recordCycle(D)
await runCycle(E, 'cycle-E-on-C')
recordCycle(E)

// Depth-3 source, depth-2 receipt chain — the deepest case.
await runCycle(G, 'cycle-G-on-E')
recordCycle(G)

// Second round to confirm state doesn't wedge.
await runCycle(D, 'cycle-D-on-B-#2')
recordCycle(D)
await runCycle(G, 'cycle-G-on-E-#2')
recordCycle(G)

// Let account state settle before reading final balances.
await new Promise(r => setTimeout(r, 4000))

const after = {}
for (const dir of [NEXUS, B, C, D, E, G]) {
  after[dir] = await getBalance(addr, dir)
}

console.log(`\n=== RESULTS ===`)
let failed = false
for (const dir of [NEXUS, B, C, D, E, G]) {
  const actual = after[dir] - before[dir]
  const expected =
    (expectedSourceDelta[dir] || 0) +
    (expectedReceiptDelta[dir] || 0)
  const ok = actual === expected
  if (!ok) failed = true
  console.log(`  ${dir.padEnd(8)} before=${before[dir]}  after=${after[dir]}  delta=${actual}  expected=${expected}  ${ok ? '✓' : '✗'}`)
}

if (failed) {
  console.error(`\n✗ Balance deltas did not match expectations`)
  process.exit(1)
}

console.log(`\n✓ Multi-depth cross-chain swap cycles succeeded.`)
console.log(`  - Tree: ${NEXUS} → {${B} → ${D}, ${C} → ${E} → ${G}}`)
console.log(`  - Receipt chains exercised at depths 0 (${NEXUS}), 1 (${B}, ${C}), and 2 (${E})`)
console.log(`  - Source chains exercised at depths 1, 2, and 3`)
