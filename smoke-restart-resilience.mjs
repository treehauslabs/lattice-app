// Restart resilience smoke test against local devnet at 127.0.0.1:8080.
// Runs a variable-rate cross-chain swap, restarts the node process, then runs
// a second variable-rate swap to verify state recovers and the chain can
// keep settling swaps after a hard restart. Also asserts the consumed
// deposit from swap A stays consumed across the restart.
//
// Self-swap on fresh keypairs each run (avoids coinbase nonce race).

import * as secp from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { readFileSync, openSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'

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
const NODE_BIN = '/Users/jbao/swiftsrc/lattice-node/.build/debug/LatticeNode'
const NODE_LOG = '/tmp/lattice-node-restart-smoke.log'

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
    const c = r.json.chains?.find(c => c.directory === chain)
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
async function rpcReady(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/chain/info`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error('RPC never became ready')
}

const IDENTITY = JSON.parse(readFileSync(`${homedir()}/.lattice/identity.json`, 'utf8'))
const minerPublicKey = IDENTITY.publicKey
const minerPrivateKey = IDENTITY.privateKey
const minerAddr = computeAddress(minerPublicKey)
const childChain = 'FastTest'

let nodeProc = null
function startNode() {
  const out = openSync(NODE_LOG, 'a')
  nodeProc = spawn(NODE_BIN, ['node', '--mine', 'Nexus', '--rpc-port', '8080'], {
    detached: true,
    stdio: ['ignore', out, out],
  })
  nodeProc.unref()
  console.log(`  spawned node pid=${nodeProc.pid}`)
}
async function stopNode() {
  if (!nodeProc) {
    const r = await rpc('GET', '/api/chain/info')
    if (!r.ok) return
  }
  console.log(`  stopping node pid=${nodeProc?.pid ?? '(unknown — not started by this script)'}`)
  if (nodeProc) {
    try { process.kill(nodeProc.pid, 'SIGKILL') } catch {}
  } else {
    // node was started externally — find pid via lsof
    try {
      const pid = execSync('lsof -nP -iTCP:8080 -sTCP:LISTEN -t', { encoding: 'utf8' }).trim().split('\n')[0]
      if (pid) execSync(`kill -9 ${pid}`)
    } catch {}
  }
  // wait for port to free
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`${BASE}/api/chain/info`, { signal: AbortSignal.timeout(500) })
    } catch {
      console.log(`  node down`)
      return
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('node failed to shut down')
}

async function stageFund(addr, fundAmount, chain, chainPath) {
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
}

async function fundAccount(addr, fundAmount, nexusDir) {
  const r = await rpc('POST', '/api/mining/stop', { chain: nexusDir })
  if (!r.ok) throw new Error(`stop mining failed: ${JSON.stringify(r.json)}`)
  // drain in-flight blocks
  for (let i = 0; i < 8; i++) {
    const h1 = await waitForHeight(nexusDir, 1)
    await new Promise(r => setTimeout(r, 300))
    const h2 = await waitForHeight(nexusDir, 1)
    if (h1 === h2) break
  }
  await stageFund(addr, fundAmount, nexusDir, [nexusDir])
  await stageFund(addr, fundAmount, childChain, [nexusDir, childChain])
  const s = await rpc('POST', '/api/mining/start', { chain: nexusDir })
  if (!s.ok) throw new Error(`start mining failed: ${JSON.stringify(s.json)}`)
  await pollUntil(async () => (await getBalance(addr, nexusDir)) >= fundAmount ? true : null,
    'nexus balance funded', 60000)
  await pollUntil(async () => (await getBalance(addr, childChain)) >= fundAmount ? true : null,
    `${childChain} balance funded`, 60000)
}

async function ensureChildChain(nexusDir) {
  const r = await rpc('GET', '/api/chain/info')
  if (r.json.chains?.find(c => c.directory === childChain)) return
  console.log(`  deploying ${childChain}...`)
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
  await waitForHeight(childChain, 5)
}

async function runSwap({ label, addr, privateKey, publicKey, amountDeposited, amountDemanded, swapNonceHex, nexusDir }) {
  console.log(`\n--- ${label}: deposited=${amountDeposited} ${childChain} demanded=${amountDemanded} Nexus (rate ${(amountDemanded / amountDeposited).toFixed(2)}x) ---`)
  const fee = 1

  const depNonce = await getNonce(addr, childChain)
  const depResult = await submit({
    chainPath: [nexusDir, childChain],
    nonce: depNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: -(amountDeposited + fee) }],
    depositActions: [{ nonce: swapNonceHex, demander: addr, amountDemanded, amountDeposited }],
  }, childChain, privateKey, publicKey)
  if (!depResult.ok) throw new Error(`deposit failed: ${JSON.stringify(depResult.submit)}`)
  console.log(`  [1/3] deposit accepted: ${depResult.submit.txCID.slice(0, 24)}...`)

  const depState = await pollUntil(async () => {
    const r = await getDeposit(addr, amountDemanded, swapNonceHex, childChain)
    return r.exists ? r : null
  }, 'deposit visible', 45000)
  if (Number(depState.amountDeposited) !== amountDeposited) {
    throw new Error(`expected amountDeposited=${amountDeposited}, got ${depState.amountDeposited}`)
  }

  const recNonce = await getNonce(addr, nexusDir)
  const recResult = await submit({
    chainPath: [nexusDir],
    nonce: recNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: -fee }],
    receiptActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded, directory: childChain }],
  }, nexusDir, privateKey, publicKey)
  if (!recResult.ok) throw new Error(`receipt failed: ${JSON.stringify(recResult.submit)}`)
  console.log(`  [2/3] receipt accepted: ${recResult.submit.txCID.slice(0, 24)}...`)

  await pollUntil(async () => {
    const r = await getReceipt(addr, amountDemanded, swapNonceHex, childChain)
    return r.exists ? r : null
  }, 'receipt visible', 45000)

  const wdNonce = await getNonce(addr, childChain)
  const wdResult = await submit({
    chainPath: [nexusDir, childChain],
    nonce: wdNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: amountDeposited - fee }],
    withdrawalActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded, amountWithdrawn: amountDeposited }],
  }, childChain, privateKey, publicKey)
  if (!wdResult.ok) throw new Error(`withdrawal failed: ${JSON.stringify(wdResult.submit)}`)
  console.log(`  [3/3] withdrawal accepted: ${wdResult.submit.txCID.slice(0, 24)}...`)

  await pollUntil(async () => {
    const r = await getDeposit(addr, amountDemanded, swapNonceHex, childChain)
    return r.exists ? null : true
  }, 'deposit consumed', 45000)
  console.log(`  ✓ swap complete (deposit consumed)`)
}

console.log('=== restart-resilience variable-rate swap smoke test ===')
console.log(`miner address: ${minerAddr}`)

// Phase 1: assume node is already running (caller's responsibility for first start)
console.log(`\n[phase 1] verifying node is up...`)
await rpcReady()
const initial = await rpc('GET', '/api/chain/info')
const nexusDir = initial.json.nexus
console.log(`  nexus=${nexusDir} chains=${initial.json.chains.map(c => `${c.directory}@${c.height}`).join(', ')}`)

await ensureChildChain(nexusDir)

// Phase 2: swap A
console.log(`\n[phase 2] swap A (pre-restart)...`)
const privA = bytesToHex(new Uint8Array(randomBytes(32)))
const pubA = bytesToHex(secp.getPublicKey(hexToBytes(privA), true))
const addrA = computeAddress(pubA)
console.log(`  user A: ${addrA}`)
console.log(`  funding...`)
await fundAccount(addrA, 5000, nexusDir)
const swapNonceA = '0a' + Date.now().toString(16).padStart(30, '0').slice(-30)
const swapA = { addr: addrA, privateKey: privA, publicKey: pubA, swapNonceHex: swapNonceA,
  amountDeposited: 100, amountDemanded: 250, nexusDir, label: 'swap A' }
await runSwap(swapA)

// Phase 3: restart node
console.log(`\n[phase 3] restarting node...`)
await stopNode()
console.log(`  starting fresh node process...`)
startNode()
await rpcReady(300000)
console.log(`  ✓ RPC ready after restart`)

// Phase 4: assert swap A's deposit is still consumed (state survived)
console.log(`\n[phase 4] verifying swap A state survived restart...`)
const postDep = await getDeposit(addrA, swapA.amountDemanded, swapA.swapNonceHex, childChain)
if (postDep.exists) {
  console.error(`  ✗ swap A deposit reappeared after restart!`)
  process.exit(1)
}
console.log(`  ✓ swap A deposit still consumed`)
const postRec = await getReceipt(addrA, swapA.amountDemanded, swapA.swapNonceHex, childChain)
if (!postRec.exists) {
  console.error(`  ✗ swap A receipt vanished after restart!`)
  process.exit(1)
}
console.log(`  ✓ swap A receipt still present (withdrawer=${postRec.withdrawer?.slice(0, 20)}...)`)

// Phase 5: wait for mining to resume after restart, then swap B with a different rate
console.log(`\n[phase 5] swap B (post-restart, different rate)...`)
console.log(`  waiting for nexus to mine again...`)
const initialHeight = (await rpc('GET', '/api/chain/info')).json.chains.find(c => c.directory === nexusDir).height
await pollUntil(async () => {
  const h = (await rpc('GET', '/api/chain/info')).json.chains.find(c => c.directory === nexusDir).height
  return h > initialHeight ? h : null
}, 'nexus mining advance after restart', 90000)
console.log(`  ✓ nexus mining`)

const privB = bytesToHex(new Uint8Array(randomBytes(32)))
const pubB = bytesToHex(secp.getPublicKey(hexToBytes(privB), true))
const addrB = computeAddress(pubB)
console.log(`  user B: ${addrB}`)
console.log(`  funding...`)
await fundAccount(addrB, 5000, nexusDir)
const swapNonceB = '0b' + Date.now().toString(16).padStart(30, '0').slice(-30)
const swapB = { addr: addrB, privateKey: privB, publicKey: pubB, swapNonceHex: swapNonceB,
  amountDeposited: 200, amountDemanded: 75, nexusDir, label: 'swap B' }  // inverse rate (0.375x)
await runSwap(swapB)

console.log(`\n=== RESULTS ===`)
console.log(`✓ swap A executed pre-restart (rate 2.50x)`)
console.log(`✓ node restarted cleanly`)
console.log(`✓ swap A deposit/receipt state survived restart`)
console.log(`✓ swap B executed post-restart (rate 0.375x — inverse) — chain still settles swaps`)
