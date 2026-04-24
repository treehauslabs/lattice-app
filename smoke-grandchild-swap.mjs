// Grandchild cross-chain swap smoke test.
//
// Deploys a 2-level deep chain structure: Nexus -> Mid -> {AlphaChain, BetaChain},
// funds a fresh user keypair on Mid and both grandchildren, then runs multiple
// deposit -> receipt -> withdrawal cycles where the deposit/withdrawal live on a
// grandchild and the receipt lives on Mid (the direct parent of the grandchild
// chain being withdrawn from). This exercises the recursive ChainLevel tree and
// validates that `withdrawalsAreValid` resolves `parentState.receiptState` via
// the correct intermediate chain, not the nexus.
//
// Targets a dedicated node instance on port 8081 with a separate data dir so it
// doesn't interfere with any long-running leak-repro node on 8080.

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
const DATA_DIR = process.env.LATTICE_DATA_DIR || '/tmp/smoke-grandchild'

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

console.log('=== grandchild cross-chain swap smoke test ===')
console.log(`miner address: ${minerAddr}`)
console.log(`user address:  ${addr}`)
console.log(`RPC:           ${BASE}`)

const initialInfo = await rpc('GET', '/api/chain/info')
const nexusDir = initialInfo.json.nexus
console.log(`initial chains: ${initialInfo.json.chains.map(c => `${c.directory}@${c.height}`).join(', ')}`)

// --- Step A: Deploy Mid as child of Nexus ---------------------------------
const MID = 'Mid'
const ALPHA = 'AlphaChain'
const BETA = 'BetaChain'

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
    premine: 100, // 100 blocks worth = 10000 coins to premineRecipient
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

console.log(`\n[A] Deploying ${MID} as child of ${nexusDir}...`)
await deployChain(MID, nexusDir)

console.log(`\n[B] Deploying grandchildren ${ALPHA} and ${BETA} as children of ${MID}...`)
await deployChain(ALPHA, MID)
await deployChain(BETA, MID)

// --- Step B: Verify parentDirectory in chain/info ------------------------
console.log(`\n[C] Verifying chain topology via /api/chain/info...`)
const postDeployInfo = await rpc('GET', '/api/chain/info')
const byDir = Object.fromEntries(postDeployInfo.json.chains.map(c => [c.directory, c]))
for (const [dir, expectedParent] of [[MID, nexusDir], [ALPHA, MID], [BETA, MID]]) {
  const c = byDir[dir]
  if (!c) throw new Error(`chain ${dir} not present in /api/chain/info after deploy`)
  if (c.parentDirectory !== expectedParent) {
    throw new Error(`chain ${dir}: expected parentDirectory=${expectedParent}, got ${c.parentDirectory}`)
  }
  console.log(`  ✓ ${dir}.parentDirectory = ${c.parentDirectory}`)
}

// --- Step C: Wait for miner to accumulate balance on each new chain -------
console.log(`\n[D] Waiting for chains to mine blocks...`)
await waitForHeight(MID, 3, 60000)
await waitForHeight(ALPHA, 3, 60000)
await waitForHeight(BETA, 3, 60000)
const heights = (await rpc('GET', '/api/chain/info')).json.chains
console.log(`  heights: ${heights.map(c => `${c.directory}@${c.height}`).join(', ')}`)

const minerMid0 = await getBalance(minerAddr, MID)
const minerAlpha0 = await getBalance(minerAddr, ALPHA)
const minerBeta0 = await getBalance(minerAddr, BETA)
console.log(`  miner balances: ${MID}=${minerMid0} ${ALPHA}=${minerAlpha0} ${BETA}=${minerBeta0}`)

const fundAmount = 5000
if (minerMid0 < fundAmount + 100 || minerAlpha0 < fundAmount + 100 || minerBeta0 < fundAmount + 100) {
  throw new Error(`Insufficient miner balance; need >= ${fundAmount + 100} on each of Mid/Alpha/Beta`)
}

// --- Step D: Fund user on Mid, Alpha, Beta --------------------------------
async function stageFund(chain, chainPath) {
  // /api/nonce returns "last used" (0 for fresh addresses where the key isn't
  // set yet). For the miner, which has produced coinbase txs on every chain,
  // the next valid nonce is lastUsed + 1. First try the returned value (works
  // for fresh senders), then bump.
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

console.log(`\n[E] Pausing mining to stage fund txs (avoids coinbase nonce race)...`)
await stopMining(nexusDir) // merge-mining: stopping nexus pauses all descendants
// Wait until every chain's height has been stable for 2 consecutive reads.
// In-flight mining iterations may still land a block after stopMining returns.
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

console.log(`staging fund txs (${fundAmount} on Mid/Alpha/Beta)...`)
await stageFund(MID, [nexusDir, MID])
await stageFund(ALPHA, [nexusDir, MID, ALPHA])
await stageFund(BETA, [nexusDir, MID, BETA])

console.log(`resuming mining`)
await startMining(nexusDir)

console.log(`waiting for fund inclusion on all chains...`)
await pollUntil(async () => (await getBalance(addr, MID)) >= fundAmount ? true : null, `user ${MID} funded`, 60000)
await pollUntil(async () => (await getBalance(addr, ALPHA)) >= fundAmount ? true : null, `user ${ALPHA} funded`, 60000)
await pollUntil(async () => (await getBalance(addr, BETA)) >= fundAmount ? true : null, `user ${BETA} funded`, 60000)

const userMid0 = await getBalance(addr, MID)
const userAlpha0 = await getBalance(addr, ALPHA)
const userBeta0 = await getBalance(addr, BETA)
console.log(`  user balances: ${MID}=${userMid0} ${ALPHA}=${userAlpha0} ${BETA}=${userBeta0}`)

// --- Step E: Run cross-chain cycles on each grandchild --------------------
// getNonce returns "last used" and can't distinguish "lastUsed=0" from "unset",
// so we track the next expected nonce per chain locally instead.
const nextNonce = { [MID]: 0, [ALPHA]: 0, [BETA]: 0 }

// Each cycle: deposit on grandchild -> receipt on Mid (its parent) -> withdrawal on grandchild
async function runCycle(grandchild, index) {
  const swapNonceHex = (Date.now() + index * 97).toString(16).padStart(32, '0').slice(-32)
  const amount = 500
  const fee = 1
  console.log(`  [cycle ${index}] grandchild=${grandchild} amount=${amount} swapNonce=0x${swapNonceHex.slice(0, 12)}...`)

  // 1. Deposit on grandchild
  const depNonce = nextNonce[grandchild]++
  const depResult = await submit({
    chainPath: [nexusDir, MID, grandchild],
    nonce: depNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: -(amount + fee) }],
    depositActions: [{ nonce: swapNonceHex, demander: addr, amountDemanded: amount, amountDeposited: amount }],
  }, grandchild, privateKey, publicKey)
  if (!depResult.ok) throw new Error(`deposit failed: ${JSON.stringify(depResult.submit)}`)
  await pollUntil(async () => {
    const r = await getDeposit(addr, amount, swapNonceHex, grandchild)
    return r.exists ? r : null
  }, `deposit visible on ${grandchild}`, 60000)

  // 2. Receipt on Mid (direct parent of grandchild)
  const recNonce = nextNonce[MID]++
  const recResult = await submit({
    chainPath: [nexusDir, MID],
    nonce: recNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: -fee }],
    receiptActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded: amount, directory: grandchild }],
  }, MID, privateKey, publicKey)
  if (!recResult.ok) throw new Error(`receipt failed: ${JSON.stringify(recResult.submit)}`)
  await pollUntil(async () => {
    const r = await getReceipt(addr, amount, swapNonceHex, grandchild)
    return r.exists ? r : null
  }, `receipt visible for ${grandchild}`, 60000)

  // 3. Withdrawal on grandchild
  const wdNonce = nextNonce[grandchild]++
  const wdResult = await submit({
    chainPath: [nexusDir, MID, grandchild],
    nonce: wdNonce,
    signers: [addr],
    fee,
    accountActions: [{ owner: addr, delta: amount - fee }],
    withdrawalActions: [{ withdrawer: addr, nonce: swapNonceHex, demander: addr, amountDemanded: amount, amountWithdrawn: amount }],
  }, grandchild, privateKey, publicKey)
  if (!wdResult.ok) throw new Error(`withdrawal failed: ${JSON.stringify(wdResult.submit)}`)
  await pollUntil(async () => {
    const r = await getDeposit(addr, amount, swapNonceHex, grandchild)
    return r.exists ? null : true
  }, `deposit consumed on ${grandchild}`, 60000)

  console.log(`    ✓ cycle complete (deposit→receipt-on-Mid→withdrawal settled)`)
}

console.log(`\n[F] Running 3 cycles on ${ALPHA}...`)
for (let i = 0; i < 3; i++) {
  await runCycle(ALPHA, i)
}

console.log(`\n[G] Running 3 cycles on ${BETA}...`)
for (let i = 0; i < 3; i++) {
  await runCycle(BETA, i + 100)
}

// Give a block for account state to settle, then check balances
await new Promise(r => setTimeout(r, 4000))
const userMid1 = await getBalance(addr, MID)
const userAlpha1 = await getBalance(addr, ALPHA)
const userBeta1 = await getBalance(addr, BETA)

console.log(`\n=== RESULTS ===`)
console.log(`${MID}        before=${userMid0}  after=${userMid1}  delta=${userMid1 - userMid0}  (3 receipts * fee=1 each per grandchild ⇒ 6 fees)`)
console.log(`${ALPHA} before=${userAlpha0}  after=${userAlpha1}  delta=${userAlpha1 - userAlpha0}  (3 cycles * -2 fees per cycle)`)
console.log(`${BETA}  before=${userBeta0}  after=${userBeta1}  delta=${userBeta1 - userBeta0}  (3 cycles * -2 fees per cycle)`)
console.log(`\n✓ Grandchild deposit → receipt-on-Mid → withdrawal cycles completed for both ${ALPHA} and ${BETA}`)
console.log(`  - chain topology: ${nexusDir} → ${MID} → {${ALPHA}, ${BETA}} via recursive ChainLevel tree`)
console.log(`  - receipt state lived on ${MID} (intermediate parent), validating tree-walk in withdrawalsAreValid`)
