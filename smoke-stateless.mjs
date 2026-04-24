// Stateless-mode CLI smoke test.
//
// Verifies the --stateless flag is wired up end-to-end:
//   1. `node --stateless --mine X` is rejected with a clear error.
//   2. `node --stateless` boots, prints "(stateless)" in the startup log,
//      and responds on its RPC endpoint.
//
// Deeper "does a stateless node actually follow a mining peer with 0 disk
// budget" coverage is out of scope here; that requires architectural work
// on the fetch/validate path (network refetch on every CAS miss) and
// belongs in a separate follow-on.
//
// Usage:
//   node smoke-stateless.mjs

import { spawn, execSync } from 'node:child_process'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const BIN = process.env.LATTICE_NODE_BIN || '/Users/jbao/swiftsrc/lattice-node/.build/debug/LatticeNode'
const ROOT = process.env.SMOKE_ROOT || '/tmp/smoke-stateless'
const PORT = 4071
const RPC = 8091
const DIR = `${ROOT}/s`

if (!existsSync(BIN)) {
  console.error(`lattice-node binary not found at ${BIN}`)
  process.exit(1)
}

console.log('=== stateless-mode CLI smoke test ===')

rmSync(ROOT, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

// --- 1. --stateless + --mine must fail fast ---
console.log('\n[1] `--stateless --mine Nexus` is rejected...')
let rejectedOK = false
try {
  const out = execSync(
    `${BIN} node --data-dir ${DIR}/reject --port 4099 --stateless --mine Nexus`,
    { stdio: 'pipe', timeout: 10000 }
  ).toString()
  console.log(`  UNEXPECTED exit 0; stdout:\n${out}`)
} catch (e) {
  const combined = (e.stdout?.toString() || '') + (e.stderr?.toString() || '')
  if (combined.includes('incompatible with --mine')) {
    console.log(`  ✓ rejected with expected message`)
    rejectedOK = true
  } else {
    console.log(`  ✗ non-zero exit, but missing expected message:\n${combined}`)
  }
}
if (!rejectedOK) {
  console.error('✗ test 1 failed')
  process.exit(1)
}

// --- 2. --stateless boots + RPC is reachable + "(stateless)" in log ---
console.log('\n[2] `--stateless` boots cleanly and RPC responds...')
const args = [
  'node',
  '--port', String(PORT),
  '--rpc-port', String(RPC),
  '--data-dir', DIR,
  '--no-dns-seeds',
  '--stateless',
]
console.log(`  ${BIN} ${args.join(' ')}`)
const p = spawn(BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
let outBuf = ''
p.stdout.on('data', d => { outBuf += d.toString() })
p.stderr.on('data', d => { outBuf += d.toString() })

process.on('exit', () => { try { p.kill('SIGTERM') } catch {} })

// Wait for RPC
let rpcUp = false
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${RPC}/api/chain/info`)
    if (res.ok) { rpcUp = true; break }
  } catch {}
  await sleep(500)
}
if (!rpcUp) {
  console.error('  ✗ stateless node RPC never came up')
  console.log(outBuf)
  p.kill('SIGTERM')
  process.exit(1)
}
console.log('  ✓ stateless node RPC up')

// Check log for the (stateless) marker
if (!outBuf.includes('(stateless)')) {
  console.error('  ✗ startup log missing "(stateless)" marker')
  console.log(outBuf.slice(0, 2000))
  p.kill('SIGTERM')
  process.exit(1)
}
console.log('  ✓ log contains "(stateless)"')

// Verify chain/info returns a nexus
const info = await (await fetch(`http://127.0.0.1:${RPC}/api/chain/info`)).json()
if (!info.nexus) {
  console.error('  ✗ /api/chain/info missing nexus:', info)
  p.kill('SIGTERM')
  process.exit(1)
}
console.log(`  ✓ /api/chain/info nexus=${info.nexus}`)

p.kill('SIGTERM')
await sleep(500)

console.log('\n✓ stateless CLI surface works end-to-end.')
process.exit(0)
