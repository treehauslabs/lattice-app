// Multi-node mesh smoke test.
//
// Spawns 3 lattice-node processes locally, forms a mesh via bootstrap peers,
// has node A mine a batch of Nexus blocks via RPC, and verifies:
//
//   (a) All three nodes boot and serve RPC.
//   (b) Node A successfully mines (merged-mining codepath — every nexus block
//       carries a childBlocks field even when empty).
//   (c) B and C form peer connections to A (mesh is up).
//   (d) B and C converge to A's tip within 15 s. Gossip follow-up now routes
//       to the announcing peer via Ivy.getDirect with bypassBudget, and
//       IvyFetcher falls back to the recently-bound pinner for sub-volumes,
//       so block-resolution no longer blocks on DHT discovery.
//
// Usage:
//   node smoke-multinode-convergence.mjs

import { spawn } from 'node:child_process'
import { readFileSync, existsSync, rmSync, mkdirSync, createWriteStream } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const BIN = process.env.LATTICE_NODE_BIN || '/Users/jbao/swiftsrc/lattice-node/.build/debug/LatticeNode'
const ROOT = process.env.SMOKE_ROOT || '/tmp/smoke-multinode'

const NODES = [
  { name: 'A', port: 4081, rpc: 8181 },
  { name: 'B', port: 4082, rpc: 8182 },
  { name: 'C', port: 4083, rpc: 8183 },
]
for (const n of NODES) n.dir = `${ROOT}/${n.name}`

if (!existsSync(BIN)) {
  console.error(`lattice-node binary not found at ${BIN}`)
  process.exit(1)
}

console.log('=== multi-node mesh smoke test ===')
rmSync(ROOT, { recursive: true, force: true })
for (const n of NODES) mkdirSync(n.dir, { recursive: true })

const procs = []
function startNode(node, extraArgs = []) {
  const args = [
    'node',
    '--port', String(node.port),
    '--rpc-port', String(node.rpc),
    '--data-dir', node.dir,
    '--no-dns-seeds',
    ...extraArgs,
  ]
  const logPath = `${ROOT}/${node.name}.log`
  const logStream = createWriteStream(logPath)
  const p = spawn(BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  p.stdout.pipe(logStream)
  p.stderr.pipe(logStream)
  p.on('exit', code => console.log(`[${node.name}] exited code=${code}`))
  procs.push({ node, proc: p, logPath })
  return p
}

function teardown() {
  for (const { proc } of procs) {
    try { proc.kill('SIGTERM') } catch {}
  }
}
process.on('SIGINT', () => { teardown(); process.exit(1) })
process.on('uncaughtException', e => { console.error(e); teardown(); process.exit(1) })

async function rpc(port, method, path, body) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function waitForRPC(node, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await rpc(node.rpc, 'GET', '/api/chain/info')
    if (r) return r
    await sleep(500)
  }
  throw new Error(`${node.name} RPC never came up`)
}

async function identity(node) {
  for (let i = 0; i < 30; i++) {
    try {
      const id = JSON.parse(readFileSync(`${node.dir}/identity.json`, 'utf8'))
      if (id.publicKey) return id.publicKey
    } catch {}
    await sleep(200)
  }
  throw new Error(`${node.name} identity.json not found`)
}

async function tipInfo(node) {
  const r = await rpc(node.rpc, 'GET', '/api/chain/info')
  if (!r) return null
  const nexus = r.chains?.find(c => c.directory === r.nexus)
  return { height: nexus?.height ?? 0, tip: nexus?.tip ?? '' }
}

async function peerCount(node) {
  const r = await rpc(node.rpc, 'GET', '/api/peers')
  if (!r) return 0
  if (typeof r.count === 'number') return r.count
  if (Array.isArray(r.peers)) return r.peers.length
  return 0
}

// 1. Start A first so we can read its pubkey for bootstrap.
console.log('\n[1] Boot node A (will mine)...')
startNode(NODES[0])
await waitForRPC(NODES[0])
const aPub = await identity(NODES[0])
console.log(`  A pubkey: ${aPub.slice(0, 32)}...`)

// 2. Start B and C, pointing at A as the bootstrap peer.
const peerArg = `${aPub}@127.0.0.1:${NODES[0].port}`
console.log(`\n[2] Boot B and C with --peer <A>...`)
startNode(NODES[1], ['--peer', peerArg])
startNode(NODES[2], ['--peer', peerArg])
await waitForRPC(NODES[1])
await waitForRPC(NODES[2])

// Give the mesh a moment to settle.
console.log('  letting peers connect...')
await sleep(3000)

// 3. Verify mesh connectivity before mining.
console.log('\n[3] Checking peer connectivity...')
const peers = await Promise.all(NODES.map(peerCount))
console.log(`  peer counts: A=${peers[0]} B=${peers[1]} C=${peers[2]}`)
const meshOK = peers[1] > 0 && peers[2] > 0
if (!meshOK) {
  console.error('  ✗ B and/or C have no peers — mesh failed to form')
  teardown()
  await sleep(500)
  process.exit(1)
}
console.log('  ✓ B and C both see at least one peer')

// 4. Start mining on A via RPC, bounded window.
console.log('\n[4] Start mining on A...')
const startMineRes = await rpc(NODES[0].rpc, 'POST', '/api/mining/start', { chain: 'Nexus' })
if (!startMineRes) { console.error('  ✗ start mining failed'); teardown(); process.exit(1) }

const MINE_WINDOW_MS = 8000
const TARGET_HEIGHT = 10
console.log(`  mining up to ${MINE_WINDOW_MS/1000}s or height ${TARGET_HEIGHT}...`)
const mineStart = Date.now()
while (Date.now() - mineStart < MINE_WINDOW_MS) {
  const t = await tipInfo(NODES[0])
  if (t && t.height >= TARGET_HEIGHT) break
  await sleep(500)
}
await rpc(NODES[0].rpc, 'POST', '/api/mining/stop', { chain: 'Nexus' })
const aTip = await tipInfo(NODES[0])
console.log(`  ✓ mining stopped; A tip height=${aTip.height}`)
if (aTip.height < 2) {
  console.error('  ✗ A failed to mine any blocks')
  teardown()
  await sleep(500)
  process.exit(1)
}

// 5. Require convergence within 15 s.
console.log('\n[5] Checking for convergence (up to 15s)...')
const deadline = Date.now() + 15000
let converged = false
while (Date.now() < deadline) {
  const [aT, bT, cT] = await Promise.all(NODES.map(tipInfo))
  process.stdout.write(`  A=${aT?.height} B=${bT?.height} C=${cT?.height}    \r`)
  if (aT?.tip && aT.tip === bT?.tip && aT.tip === cT?.tip) {
    converged = true
    console.log(`\n  ✓ converged at height=${aT.height} tip=${aT.tip.slice(0, 20)}...`)
    break
  }
  await sleep(1000)
}

if (!converged) {
  const [aT, bT, cT] = await Promise.all(NODES.map(tipInfo))
  const [pA, pB, pC] = await Promise.all(NODES.map(peerCount))
  console.error(`\n  ✗ convergence failed within 15 s:`)
  console.error(`    A: h=${aT?.height} tip=${aT?.tip?.slice(0,20)} peers=${pA}`)
  console.error(`    B: h=${bT?.height} tip=${bT?.tip?.slice(0,20)} peers=${pB}`)
  console.error(`    C: h=${cT?.height} tip=${cT?.tip?.slice(0,20)} peers=${pC}`)
  teardown()
  await sleep(500)
  process.exit(1)
}

console.log('\n✓ three-node mesh smoke test passed.')
teardown()
await sleep(500)
process.exit(0)
