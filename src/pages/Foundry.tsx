import { useMemo, useState, useCallback } from 'react'
import {
  Hammer, Timer, Coins, Scale, Gauge, HardDrive, BarChart3, Filter,
  Sliders, ChevronDown, ChevronRight, AlertCircle, CheckCircle2,
  Zap, Shield, Activity, Rocket, Feather, Wand2, Pickaxe, Plus, X,
  Server, Code, Copy, FileUp, Check,
} from 'lucide-react'
import { useNode } from '../hooks/useNode'
import { useWallet } from '../hooks/useWallet'
import { lattice } from '../api/client'
import { publicKeyFromPrivate } from '../wallet/signer'
import { decryptPrivateKey } from '../wallet/keystore'
import { CodeEditor } from '../components/CodeEditor'

// ============================================================
// Spec + presets
// ============================================================

interface ChainDraft {
  directory: string
  parentDirectory: string
  targetBlockTime: number         // ms
  initialRewardExponent: number   // 2^N, 0..62
  halvingInterval: number
  premine: number                 // in blocks
  maxTransactionsPerBlock: number
  maxStateGrowth: number          // bytes
  maxBlockSize: number            // bytes
  difficultyAdjustmentWindow: number
  transactionFilters: string[]
  actionFilters: string[]
  premineRecipient: string        // address
  startMining: boolean
}

type PresetKey = 'standard' | 'fast' | 'secure' | 'highThroughput' | 'minimal'

const PRESETS: Record<PresetKey, { label: string; icon: typeof Zap; tagline: string; apply: (d: ChainDraft) => ChainDraft }> = {
  standard: {
    label: 'Standard',
    icon: Feather,
    tagline: '2s blocks · balanced',
    apply: d => ({
      ...d,
      targetBlockTime: 2000,
      initialRewardExponent: 10,
      halvingInterval: 210_000,
      maxTransactionsPerBlock: 100,
      maxStateGrowth: 100_000,
      maxBlockSize: 1_000_000,
      difficultyAdjustmentWindow: 10,
    }),
  },
  fast: {
    label: 'Fast',
    icon: Zap,
    tagline: '500ms blocks · low latency',
    apply: d => ({
      ...d,
      targetBlockTime: 500,
      initialRewardExponent: 8,
      halvingInterval: 500_000,
      maxTransactionsPerBlock: 200,
      maxStateGrowth: 200_000,
      maxBlockSize: 1_000_000,
      difficultyAdjustmentWindow: 20,
    }),
  },
  secure: {
    label: 'Secure',
    icon: Shield,
    tagline: '10s blocks · high finality',
    apply: d => ({
      ...d,
      targetBlockTime: 10_000,
      initialRewardExponent: 12,
      halvingInterval: 100_000,
      maxTransactionsPerBlock: 50,
      maxStateGrowth: 50_000,
      maxBlockSize: 1_000_000,
      difficultyAdjustmentWindow: 20,
    }),
  },
  highThroughput: {
    label: 'High Throughput',
    icon: Rocket,
    tagline: '1s blocks · heavy traffic',
    apply: d => ({
      ...d,
      targetBlockTime: 1000,
      initialRewardExponent: 8,
      halvingInterval: 500_000,
      maxTransactionsPerBlock: 1_000,
      maxStateGrowth: 500_000,
      maxBlockSize: 5_000_000,
      difficultyAdjustmentWindow: 15,
    }),
  },
  minimal: {
    label: 'Minimal',
    icon: Activity,
    tagline: '5s blocks · tiny footprint',
    apply: d => ({
      ...d,
      targetBlockTime: 5_000,
      initialRewardExponent: 6,
      halvingInterval: 50_000,
      maxTransactionsPerBlock: 20,
      maxStateGrowth: 10_000,
      maxBlockSize: 200_000,
      difficultyAdjustmentWindow: 10,
    }),
  },
}

/// Sort chains into a depth-first traversal order where each row carries its
/// nesting depth. Orphans (chains whose parent isn't in the set) appear at
/// depth 0 after nexus so operators can still target them.
function buildChainHierarchy(
  chains: Array<{ directory: string; parentDirectory: string | null }>,
  nexusName: string
): Array<{ directory: string; depth: number }> {
  const byParent = new Map<string, string[]>()
  const known = new Set(chains.map(c => c.directory))
  for (const c of chains) {
    if (c.directory === nexusName) continue
    const parent = c.parentDirectory && known.has(c.parentDirectory) ? c.parentDirectory : nexusName
    const siblings = byParent.get(parent) ?? []
    siblings.push(c.directory)
    byParent.set(parent, siblings)
  }
  const result: Array<{ directory: string; depth: number }> = []
  const walk = (dir: string, depth: number) => {
    result.push({ directory: dir, depth })
    const kids = byParent.get(dir) ?? []
    kids.sort()
    for (const k of kids) walk(k, depth + 1)
  }
  walk(nexusName, 0)
  return result
}

function emptyDraft(parent: string): ChainDraft {
  return {
    directory: '',
    parentDirectory: parent,
    targetBlockTime: 2000,
    initialRewardExponent: 10,
    halvingInterval: 210_000,
    premine: 0,
    maxTransactionsPerBlock: 100,
    maxStateGrowth: 100_000,
    maxBlockSize: 1_000_000,
    difficultyAdjustmentWindow: 10,
    transactionFilters: [],
    actionFilters: [],
    premineRecipient: '',
    startMining: true,
  }
}

// ============================================================
// Config file serialization (YAML / JSON)
// ============================================================

type EditorMode = 'visual' | 'code'
type CodeFormat = 'yaml' | 'json'

interface ChainSpec {
  name: string
  parent: string
  targetBlockTime: number
  initialRewardExponent: number
  halvingInterval: number
  premine: number
  premineRecipient: string
  maxTransactionsPerBlock: number
  maxStateGrowth: number
  maxBlockSize: number
  difficultyAdjustmentWindow: number
  transactionFilters: string[]
  actionFilters: string[]
}

function draftToSpec(d: ChainDraft): ChainSpec {
  return {
    name: d.directory,
    parent: d.parentDirectory,
    targetBlockTime: d.targetBlockTime,
    initialRewardExponent: d.initialRewardExponent,
    halvingInterval: d.halvingInterval,
    premine: d.premine,
    premineRecipient: d.premineRecipient,
    maxTransactionsPerBlock: d.maxTransactionsPerBlock,
    maxStateGrowth: d.maxStateGrowth,
    maxBlockSize: d.maxBlockSize,
    difficultyAdjustmentWindow: d.difficultyAdjustmentWindow,
    transactionFilters: d.transactionFilters,
    actionFilters: d.actionFilters,
  }
}

function specToDraft(spec: Partial<ChainSpec>, fallback: ChainDraft): ChainDraft {
  return {
    directory: typeof spec.name === 'string' ? spec.name : fallback.directory,
    parentDirectory: typeof spec.parent === 'string' ? spec.parent : fallback.parentDirectory,
    targetBlockTime: typeof spec.targetBlockTime === 'number' ? spec.targetBlockTime : fallback.targetBlockTime,
    initialRewardExponent: typeof spec.initialRewardExponent === 'number' ? spec.initialRewardExponent : fallback.initialRewardExponent,
    halvingInterval: typeof spec.halvingInterval === 'number' ? spec.halvingInterval : fallback.halvingInterval,
    premine: typeof spec.premine === 'number' ? spec.premine : fallback.premine,
    premineRecipient: typeof spec.premineRecipient === 'string' ? spec.premineRecipient : fallback.premineRecipient,
    maxTransactionsPerBlock: typeof spec.maxTransactionsPerBlock === 'number' ? spec.maxTransactionsPerBlock : fallback.maxTransactionsPerBlock,
    maxStateGrowth: typeof spec.maxStateGrowth === 'number' ? spec.maxStateGrowth : fallback.maxStateGrowth,
    maxBlockSize: typeof spec.maxBlockSize === 'number' ? spec.maxBlockSize : fallback.maxBlockSize,
    difficultyAdjustmentWindow: typeof spec.difficultyAdjustmentWindow === 'number' ? spec.difficultyAdjustmentWindow : fallback.difficultyAdjustmentWindow,
    startMining: fallback.startMining,
    transactionFilters: Array.isArray(spec.transactionFilters) ? spec.transactionFilters.map(String) : fallback.transactionFilters,
    actionFilters: Array.isArray(spec.actionFilters) ? spec.actionFilters.map(String) : fallback.actionFilters,
  }
}

function draftToYaml(d: ChainDraft): string {
  const q = (s: string) => /^[\w./-]*$/.test(s) && s !== '' ? s : `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  const arr = (items: string[]) => {
    if (items.length === 0) return '[]'
    return '\n' + items.map(f => `  - ${JSON.stringify(f)}`).join('\n')
  }
  return [
    `name: ${q(d.directory)}`,
    `parent: ${q(d.parentDirectory)}`,
    ``,
    `targetBlockTime: ${d.targetBlockTime}`,
    `initialRewardExponent: ${d.initialRewardExponent}`,
    `halvingInterval: ${d.halvingInterval}`,
    ``,
    `premine: ${d.premine}`,
    `premineRecipient: ${q(d.premineRecipient)}`,
    ``,
    `maxTransactionsPerBlock: ${d.maxTransactionsPerBlock}`,
    `maxStateGrowth: ${d.maxStateGrowth}`,
    `maxBlockSize: ${d.maxBlockSize}`,
    ``,
    `difficultyAdjustmentWindow: ${d.difficultyAdjustmentWindow}`,
    ``,
    `transactionFilters: ${arr(d.transactionFilters)}`,
    `actionFilters: ${arr(d.actionFilters)}`,
  ].join('\n') + '\n'
}

function draftToJson(d: ChainDraft): string {
  return JSON.stringify(draftToSpec(d), null, 2) + '\n'
}

function parseYamlScalar(s: string): string | number | boolean {
  const t = s.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1)
  const n = Number(t)
  if (t !== '' && !isNaN(n)) return n
  return t
}

function stripYamlComment(line: string): string {
  let inSingle = false, inDouble = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i)
  }
  return line
}

function parseYamlConfig(text: string): { result?: Record<string, unknown>; error?: string } {
  try {
    const obj: Record<string, unknown> = {}
    const lines = text.split('\n')
    let i = 0

    while (i < lines.length) {
      const stripped = stripYamlComment(lines[i]).trim()
      if (!stripped) { i++; continue }

      const kv = stripped.match(/^([a-zA-Z]\w*)\s*:\s*(.*)$/)
      if (!kv) return { error: `Line ${i + 1}: expected "key: value"` }

      const key = kv[1]
      const val = kv[2].trim()

      if (val === '[]') {
        obj[key] = []; i++
      } else if (val.startsWith('[')) {
        const inner = val.slice(1, val.lastIndexOf(']')).trim()
        obj[key] = inner ? inner.split(',').map(s => parseYamlScalar(s.trim())) : []
        i++
      } else if (val === '') {
        const items: unknown[] = []
        i++
        while (i < lines.length) {
          const next = stripYamlComment(lines[i]).trimEnd()
          const m = next.match(/^\s+-\s+(.*)$/) || next.match(/^\s+-(.+)$/)
          if (!m) break
          items.push(parseYamlScalar(m[1]))
          i++
        }
        obj[key] = items
      } else {
        obj[key] = parseYamlScalar(val)
        i++
      }
    }
    return { result: obj }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Parse error' }
  }
}

function parseCode(text: string, format: CodeFormat, fallback: ChainDraft): { draft?: ChainDraft; error?: string } {
  try {
    if (format === 'json') {
      const obj = JSON.parse(text)
      if (!obj || typeof obj !== 'object') return { error: 'Expected a JSON object' }
      return { draft: specToDraft(obj, fallback) }
    }
    const { result, error } = parseYamlConfig(text)
    if (error) return { error }
    if (!result) return { error: 'Empty document' }
    return { draft: specToDraft(result as Partial<ChainSpec>, fallback) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Parse error' }
  }
}

// ============================================================
// Preview math
// ============================================================

function initialReward(exp: number): number {
  if (exp < 0 || exp > 62) return 0
  return Math.pow(2, exp)
}

function totalRewards(exp: number, halvingInterval: number): number {
  // Sum reward across halvings: initialReward * halvingInterval * 2
  return initialReward(exp) * halvingInterval * 2
}

function premineAmount(exp: number, premineBlocks: number): number {
  return initialReward(exp) * premineBlocks
}

function formatLarge(n: number): string {
  if (n >= 1e15) return (n / 1e15).toFixed(2) + 'Q'
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'
  return n.toLocaleString()
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  if (s < 3600) return `${(s / 60).toFixed(1)}m`
  return `${(s / 3600).toFixed(1)}h`
}

interface ValidationIssue { kind: 'error' | 'warning'; message: string }

function validate(d: ChainDraft, existingChains: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const name = d.directory.trim()
  if (!name) {
    issues.push({ kind: 'error', message: 'Name is required' })
  } else if (name === 'Nexus') {
    issues.push({ kind: 'error', message: '"Nexus" is reserved' })
  } else if (/[\s/]/.test(name)) {
    issues.push({ kind: 'error', message: 'Name cannot contain spaces or slashes' })
  } else if (existingChains.includes(name)) {
    issues.push({ kind: 'error', message: `Chain "${name}" already exists` })
  }
  if (!d.parentDirectory) issues.push({ kind: 'error', message: 'Pick a parent chain' })
  if (d.targetBlockTime <= 0) issues.push({ kind: 'error', message: 'Block time must be > 0' })
  if (d.targetBlockTime < 100) issues.push({ kind: 'warning', message: 'Block time < 100ms may cause high fork rate' })
  if (d.targetBlockTime > 600_000) issues.push({ kind: 'warning', message: 'Block time > 10 min slows confirmations' })
  if (d.initialRewardExponent < 0 || d.initialRewardExponent > 62) issues.push({ kind: 'error', message: 'Reward exponent must be 0..62' })
  if (d.initialRewardExponent === 0) issues.push({ kind: 'warning', message: 'Reward exponent 0 = 1 token/block' })
  if (d.halvingInterval <= 0) issues.push({ kind: 'error', message: 'Halving interval must be > 0' })
  if (d.premine >= d.halvingInterval) issues.push({ kind: 'error', message: 'Premine must be less than halving interval' })
  if (d.maxTransactionsPerBlock <= 0) issues.push({ kind: 'error', message: 'Max tx/block must be > 0' })
  if (d.maxTransactionsPerBlock > 10_000) issues.push({ kind: 'warning', message: 'Very high tx/block may produce oversized blocks' })
  if (d.maxStateGrowth <= 0) issues.push({ kind: 'error', message: 'Max state growth must be > 0' })
  if (d.maxBlockSize <= 0) issues.push({ kind: 'error', message: 'Max block size must be > 0' })
  if (d.difficultyAdjustmentWindow <= 0) issues.push({ kind: 'error', message: 'Difficulty window must be > 0' })
  if (d.premine > 0 && !d.premineRecipient) issues.push({ kind: 'error', message: 'Premine needs a recipient address' })
  d.transactionFilters.forEach((f, i) => { if (!f.trim()) issues.push({ kind: 'warning', message: `Tx filter #${i + 1} is empty` }) })
  d.actionFilters.forEach((f, i) => { if (!f.trim()) issues.push({ kind: 'warning', message: `Action filter #${i + 1} is empty` }) })
  return issues
}

// ============================================================
// Small helpers
// ============================================================

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-zinc-500 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  )
}

function NumberInput({
  value, onChange, min, max, suffix,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value)
          onChange(Number.isFinite(v) ? v : 0)
        }}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:border-lattice-500"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500 pointer-events-none">{suffix}</span>
      )}
    </div>
  )
}

const BYTE_UNITS = [
  { label: 'B', factor: 1 },
  { label: 'KB', factor: 1024 },
  { label: 'MB', factor: 1024 * 1024 },
] as const

function ByteInput({
  value, onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  const best = value >= 1024 * 1024 ? 2 : value >= 1024 ? 1 : 0
  const [unitIdx, setUnitIdx] = useState(best)
  const unit = BYTE_UNITS[unitIdx]
  const display = value / unit.factor

  return (
    <div className="flex gap-1.5">
      <div className="relative flex-1">
        <input
          type="number"
          value={display}
          min={1}
          onChange={e => {
            const v = parseFloat(e.target.value)
            onChange(Number.isFinite(v) ? Math.max(1, Math.floor(v * unit.factor)) : 1)
          }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:border-lattice-500"
        />
      </div>
      <select
        value={unitIdx}
        onChange={e => {
          const idx = parseInt(e.target.value)
          setUnitIdx(idx)
        }}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-lattice-500"
      >
        {BYTE_UNITS.map((u, i) => (
          <option key={u.label} value={i}>{u.label}</option>
        ))}
      </select>
    </div>
  )
}

// ============================================================
// Unlock miner modal (for premine signature)
// ============================================================

function UnlockMinerModal({
  onClose, onUnlocked, chainName,
}: {
  onClose: () => void
  onUnlocked: (identity: { publicKey: string; privateKey: string }) => Promise<void>
  chainName: string
}) {
  const { accounts, minerIndex, activeIndex } = useWallet()
  const initial = minerIndex >= 0 ? minerIndex : activeIndex
  const [selectedIndex, setSelectedIndex] = useState(initial)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selected = accounts[selectedIndex]

  const handleUnlock = async () => {
    if (!selected) { setError('Pick an account'); return }
    if (!password) { setError('Password required'); return }
    setLoading(true)
    setError('')
    try {
      const privateKey = await decryptPrivateKey(selected.encrypted, password)
      const publicKey = publicKeyFromPrivate(privateKey)
      await onUnlocked({ publicKey, privateKey })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <h3 className="font-semibold">Unlock miner for {chainName}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {accounts.length === 0 ? (
            <p className="text-sm text-zinc-400">Create a wallet account first — block rewards are paid to a wallet address.</p>
          ) : (
            <>
              <Field label="Reward account">
                <select
                  value={selectedIndex}
                  onChange={e => setSelectedIndex(parseInt(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-lattice-500"
                >
                  {accounts.map((a, i) => (
                    <option key={a.publicKey} value={i}>
                      {a.name}{a.isMiner ? ' (Miner)' : ''} — {a.address.slice(0, 16)}...
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Password">
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  autoFocus
                  placeholder="Wallet password"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
                  onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                />
              </Field>
              {error && <p className="text-red-400 text-xs flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
              <button
                onClick={handleUnlock}
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {loading ? 'Unlocking...' : 'Unlock & mint'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Main page
// ============================================================

export function Foundry() {
  const { connected, chains } = useNode()
  const { accounts, minerAccount } = useWallet()

  const nexusName = chains.find(c => c.directory === 'Nexus')?.directory ?? (chains[0]?.directory ?? 'Nexus')
  const [draft, setDraft] = useState<ChainDraft>(() => emptyDraft(nexusName))
  const [preset, setPreset] = useState<PresetKey | 'custom'>('standard')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [success, setSuccess] = useState<{ directory: string; genesisHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<EditorMode>('visual')
  const [codeFormat, setCodeFormat] = useState<CodeFormat>('yaml')
  const [codeText, setCodeText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const existingNames = chains.map(c => c.directory)

  const update = (patch: Partial<ChainDraft>) => {
    setDraft(d => ({ ...d, ...patch }))
    setPreset('custom')
  }

  const switchToCode = useCallback(() => {
    setCodeText(codeFormat === 'yaml' ? draftToYaml(draft) : draftToJson(draft))
    setParseError(null)
    setMode('code')
  }, [draft, codeFormat])

  const switchToVisual = useCallback(() => {
    if (codeText) {
      const result = parseCode(codeText, codeFormat, draft)
      if (result.error) {
        setParseError(result.error)
        return
      }
      if (result.draft) {
        setDraft(result.draft)
        setPreset('custom')
      }
    }
    setParseError(null)
    setMode('visual')
  }, [codeText, codeFormat, draft])

  const handleCodeChange = useCallback((text: string) => {
    setCodeText(text)
    const result = parseCode(text, codeFormat, draft)
    if (result.error) {
      setParseError(result.error)
    } else if (result.draft) {
      setParseError(null)
      setDraft(result.draft)
      setPreset('custom')
    }
  }, [codeFormat, draft])

  const switchFormat = useCallback((fmt: CodeFormat) => {
    const result = parseCode(codeText, codeFormat, draft)
    if (result.draft) {
      setCodeFormat(fmt)
      setCodeText(fmt === 'yaml' ? draftToYaml(result.draft) : draftToJson(result.draft))
      setParseError(null)
    } else {
      setCodeFormat(fmt)
      setParseError('Fix syntax errors before converting')
    }
  }, [codeText, codeFormat, draft])

  const handleCopy = useCallback(() => {
    const text = mode === 'code' ? codeText : (codeFormat === 'yaml' ? draftToYaml(draft) : draftToJson(draft))
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [mode, codeText, codeFormat, draft])

  const handleImportFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.yaml,.yml,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      const fmt: CodeFormat = file.name.endsWith('.json') ? 'json' : 'yaml'
      setCodeFormat(fmt)
      setCodeText(text)
      setMode('code')
      const result = parseCode(text, fmt, draft)
      if (result.draft) {
        setDraft(result.draft)
        setPreset('custom')
        setParseError(null)
      } else {
        setParseError(result.error ?? 'Invalid file')
      }
    }
    input.click()
  }, [draft])

  const applyPreset = (key: PresetKey) => {
    const next = PRESETS[key].apply(draft)
    setDraft(next)
    setPreset(key)
    if (mode === 'code') {
      setCodeText(codeFormat === 'yaml' ? draftToYaml(next) : draftToJson(next))
      setParseError(null)
    }
  }

  const issues = useMemo(() => validate(draft, existingNames), [draft, existingNames])
  const errors = issues.filter(i => i.kind === 'error')
  const warnings = issues.filter(i => i.kind === 'warning')

  const reward = initialReward(draft.initialRewardExponent)
  const total = totalRewards(draft.initialRewardExponent, draft.halvingInterval)
  const premine = premineAmount(draft.initialRewardExponent, draft.premine)
  const blocksPerDay = draft.targetBlockTime > 0 ? Math.floor(86_400_000 / draft.targetBlockTime) : 0
  const rewardsPerDay = blocksPerDay * reward

  const doDeploy = async (identity?: { publicKey: string; privateKey: string }) => {
    setError(null)
    setDeploying(true)
    try {
      const res = await lattice.deployChain({
        directory: draft.directory.trim(),
        parentDirectory: draft.parentDirectory,
        targetBlockTime: draft.targetBlockTime,
        initialReward: reward,
        halvingInterval: draft.halvingInterval,
        premine: draft.premine,
        maxTransactionsPerBlock: draft.maxTransactionsPerBlock,
        maxStateGrowth: draft.maxStateGrowth,
        maxBlockSize: draft.maxBlockSize,
        difficultyAdjustmentWindow: draft.difficultyAdjustmentWindow,
        transactionFilters: draft.transactionFilters.filter(f => f.trim()),
        actionFilters: draft.actionFilters.filter(f => f.trim()),
        premineRecipient: draft.premine > 0 ? draft.premineRecipient : undefined,
        startMining: draft.startMining,
        minerPublicKey: identity?.publicKey,
        minerPrivateKey: identity?.privateKey,
      })
      setSuccess({ directory: res.directory, genesisHash: res.genesisHash })
      const fresh = emptyDraft(nexusName)
      setDraft(fresh)
      setPreset('standard')
      if (mode === 'code') {
        setCodeText(codeFormat === 'yaml' ? draftToYaml(fresh) : draftToJson(fresh))
        setParseError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deploy failed')
    }
    setDeploying(false)
  }

  const handleMint = () => {
    if (errors.length > 0) return
    if (draft.startMining) {
      setUnlockOpen(true)
      return
    }
    doDeploy()
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-4">
            <Hammer size={28} className="text-zinc-700" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-200 mb-2">Foundry</h2>
          <p className="text-zinc-500 text-sm">Connect to a node to forge new chains.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Hammer size={22} className="text-lattice-400" /> Foundry
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Forge a new chain anchored to a parent. Every parameter is yours to set.</p>
        </div>
        <div className="flex items-center bg-zinc-800/60 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={mode === 'code' ? switchToVisual : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
              mode === 'visual'
                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Sliders size={12} />
            Visual
          </button>
          <button
            onClick={mode === 'visual' ? switchToCode : undefined}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
              mode === 'code'
                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Code size={12} />
            Code
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-600/10 border border-emerald-700/40 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-emerald-300">Chain "{success.directory}" is live</div>
            <div className="text-[11px] text-zinc-500 font-mono break-all mt-0.5">Genesis: {success.genesisHash}</div>
          </div>
          <button onClick={() => setSuccess(null)} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
        </div>
      )}

      {/* Presets */}
      <div className="mb-6">
        <div className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1.5">
          <Wand2 size={12} /> Start from a preset
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {(Object.keys(PRESETS) as PresetKey[]).map(key => {
            const p = PRESETS[key]
            const Icon = p.icon
            const active = preset === key
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                  active
                    ? 'bg-lattice-600/10 border-lattice-600/40'
                    : 'bg-zinc-900/60 border-zinc-800/60 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={13} className={active ? 'text-lattice-400' : 'text-zinc-400'} />
                  <span className={`text-sm font-medium ${active ? 'text-lattice-400' : 'text-zinc-200'}`}>{p.label}</span>
                </div>
                <div className="text-[11px] text-zinc-500">{p.tagline}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {mode === 'code' ? (
            <>
              {/* Code toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center bg-zinc-800/60 rounded-lg p-0.5 gap-0.5">
                  {(['yaml', 'json'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => switchFormat(fmt)}
                      className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-all duration-150 ${
                        codeFormat === fmt
                          ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleImportFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <FileUp size={12} /> Import
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    {copied ? <><Check size={12} className="text-emerald-400" /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              </div>
              <CodeEditor
                value={codeText}
                onChange={handleCodeChange}
                error={parseError}
              />
            </>
          ) : (
            <>
              {/* Identity */}
              <section className="bg-zinc-900/80 rounded-2xl p-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Chain name" hint="Directory identifier on the node">
                    <input
                      value={draft.directory}
                      onChange={e => update({ directory: e.target.value })}
                      placeholder="MyChain"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
                    />
                  </Field>
                  <Field label="Parent chain" hint="Inherits security via merged mining">
                    <select
                      value={draft.parentDirectory}
                      onChange={e => update({ parentDirectory: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-lattice-500"
                    >
                      {buildChainHierarchy(chains, nexusName).map(({ directory, depth }) => (
                        <option key={directory} value={directory}>
                          {' '.repeat(depth * 2) + (depth > 0 ? '↳ ' : '') + directory}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

              {/* Chain Parameters */}
              <section className="bg-zinc-900/80 rounded-2xl p-5">
                <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <Sliders size={14} className="text-lattice-400" /> Chain Parameters
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Block time" hint={`Target interval · ${formatDuration(draft.targetBlockTime)}`}>
                    <NumberInput
                      value={draft.targetBlockTime}
                      onChange={n => update({ targetBlockTime: Math.max(0, Math.floor(n)) })}
                      min={1}
                      suffix="ms"
                    />
                  </Field>
                  <Field label="Difficulty window" hint="Blocks averaged to retarget">
                    <NumberInput
                      value={draft.difficultyAdjustmentWindow}
                      onChange={n => update({ difficultyAdjustmentWindow: Math.max(1, Math.floor(n)) })}
                      min={1}
                      suffix="blocks"
                    />
                  </Field>
                  <Field label="Initial reward" hint={`2^${draft.initialRewardExponent} = ${reward.toLocaleString()} tokens/block`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={32}
                        step={1}
                        value={draft.initialRewardExponent}
                        onChange={e => update({ initialRewardExponent: parseInt(e.target.value) })}
                        className="flex-1 accent-lattice-500"
                      />
                      <span className="text-xs font-mono tabular-nums text-zinc-300 w-14 text-right">2^{draft.initialRewardExponent}</span>
                    </div>
                  </Field>
                  <Field label="Halving interval" hint={`${formatDuration(draft.halvingInterval * draft.targetBlockTime)} between halvings`}>
                    <NumberInput
                      value={draft.halvingInterval}
                      onChange={n => update({ halvingInterval: Math.max(1, Math.floor(n)) })}
                      min={1}
                      suffix="blocks"
                    />
                  </Field>
                </div>
                <div className="border-t border-zinc-800/60 mt-4 pt-4">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Field label="Max tx / block">
                      <NumberInput
                        value={draft.maxTransactionsPerBlock}
                        onChange={n => update({ maxTransactionsPerBlock: Math.max(1, Math.floor(n)) })}
                        min={1}
                      />
                    </Field>
                    <Field label="Max state growth" hint="Per block">
                      <ByteInput
                        value={draft.maxStateGrowth}
                        onChange={n => update({ maxStateGrowth: n })}
                      />
                    </Field>
                    <Field label="Max block size">
                      <ByteInput
                        value={draft.maxBlockSize}
                        onChange={n => update({ maxBlockSize: n })}
                      />
                    </Field>
                  </div>
                </div>
              </section>

              {/* Genesis */}
              <section className="bg-zinc-900/80 rounded-2xl p-5">
                <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <Pickaxe size={14} className="text-lattice-400" /> Genesis
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field
                    label="Premine"
                    hint={
                      draft.premine > 0
                        ? `${formatLarge(premine)} tokens minted into genesis`
                        : 'No pre-allocated supply'
                    }
                  >
                    <NumberInput
                      value={draft.premine}
                      onChange={n => update({ premine: Math.max(0, Math.floor(n)) })}
                      min={0}
                      suffix="blocks"
                    />
                  </Field>
                  {draft.premine > 0 && (
                    <Field label="Premine recipient" hint="Receives the pre-allocated supply">
                      <select
                        value={draft.premineRecipient}
                        onChange={e => update({ premineRecipient: e.target.value })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-lattice-500"
                      >
                        <option value="">Pick a wallet account...</option>
                        {accounts.map(a => (
                          <option key={a.publicKey} value={a.address}>
                            {a.name} — {a.address.slice(0, 20)}...
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>

                {(draft.transactionFilters.length > 0 || draft.actionFilters.length > 0 || filtersOpen) ? (
                  <div className="border-t border-zinc-800/60 mt-4 pt-4 space-y-5">
                    <FilterEditor
                      label="Transaction filters"
                      hint="JavaScript predicate evaluated per transaction body"
                      filters={draft.transactionFilters}
                      onChange={fs => update({ transactionFilters: fs })}
                    />
                    <FilterEditor
                      label="Action filters"
                      hint="JavaScript predicate evaluated per action"
                      filters={draft.actionFilters}
                      onChange={fs => update({ actionFilters: fs })}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setFiltersOpen(true)}
                    className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
                  >
                    <Filter size={11} /> Add transaction or action filters...
                  </button>
                )}
              </section>
            </>
          )}
        </div>

        {/* Preview + deploy */}
        <aside className="lg:sticky lg:top-6 self-start space-y-4">
          <div className="bg-zinc-900/80 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} className="text-lattice-400" />
              <span className="font-semibold text-sm">Preview</span>
            </div>
            <div className="space-y-2.5">
              <PreviewRow icon={Server} label="Name" value={draft.directory || '—'} mono />
              <PreviewRow icon={ChevronRight} label="Parent" value={draft.parentDirectory} />
              <PreviewRow icon={Timer} label="Block time" value={formatDuration(draft.targetBlockTime)} />
              <PreviewRow icon={Coins} label="Reward" value={`${reward.toLocaleString()} / block`} />
              <PreviewRow icon={Scale} label="Halving every" value={formatDuration(draft.halvingInterval * draft.targetBlockTime)} />
              <PreviewRow icon={BarChart3} label="Max supply" value={`~${formatLarge(total)}`} />
              <PreviewRow icon={Activity} label="Blocks / day" value={blocksPerDay.toLocaleString()} />
              <PreviewRow icon={Coins} label="Rewards / day" value={formatLarge(rewardsPerDay)} />
              {draft.premine > 0 && (
                <PreviewRow icon={Pickaxe} label="Premine" value={formatLarge(premine)} />
              )}
              <PreviewRow icon={Gauge} label="Throughput" value={`${(draft.maxTransactionsPerBlock / (draft.targetBlockTime / 1000)).toFixed(1)} tx/s cap`} />
              <PreviewRow icon={HardDrive} label="Block size" value={formatBytes(draft.maxBlockSize)} />
            </div>
          </div>

          {(errors.length > 0 || warnings.length > 0) && (
            <div className="bg-zinc-900/80 rounded-2xl p-5 space-y-2">
              {errors.map((iss, i) => (
                <div key={`e-${i}`} className="flex items-start gap-2 text-xs text-red-400">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> <span>{iss.message}</span>
                </div>
              ))}
              {warnings.map((iss, i) => (
                <div key={`w-${i}`} className="flex items-start gap-2 text-xs text-yellow-500">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> <span>{iss.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="bg-zinc-900/80 rounded-2xl p-5">
            <label className="flex items-center gap-2 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={draft.startMining}
                onChange={e => update({ startMining: e.target.checked })}
                className="accent-lattice-500"
              />
              <span className="text-sm text-zinc-300">Start mining after deploy</span>
            </label>
            <button
              onClick={handleMint}
              disabled={errors.length > 0 || deploying}
              className="w-full py-3.5 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {deploying ? (
                <>Deploying...</>
              ) : (
                <>
                  <Hammer size={14} /> Mint genesis & deploy
                </>
              )}
            </button>
            {error && <p className="text-red-400 text-xs flex items-center gap-1.5 mt-3"><AlertCircle size={12} /> {error}</p>}
            {draft.startMining && accounts.length === 0 && (
              <p className="text-yellow-500 text-xs flex items-center gap-1.5 mt-3">
                <AlertCircle size={12} /> Auto-mining requires a wallet account for rewards
              </p>
            )}
            {draft.startMining && !minerAccount && accounts.length > 0 && (
              <p className="text-zinc-500 text-xs mt-3">
                Rewards will be credited to your selected account at unlock time.
              </p>
            )}
          </div>
        </aside>
      </div>

      {unlockOpen && (
        <UnlockMinerModal
          chainName={draft.directory || 'new chain'}
          onClose={() => setUnlockOpen(false)}
          onUnlocked={async identity => { await doDeploy(identity) }}
        />
      )}
    </div>
  )
}

// ============================================================
// Subcomponents
// ============================================================

function PreviewRow({
  icon: Icon, label, value, mono,
}: { icon: typeof Coins; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-0">
        <Icon size={11} className="text-zinc-600 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <span className={`text-xs text-zinc-200 ${mono ? 'font-mono' : 'tabular-nums'} text-right truncate`}>{value}</span>
    </div>
  )
}

function FilterEditor({
  label, hint, filters, onChange,
}: {
  label: string
  hint: string
  filters: string[]
  onChange: (fs: string[]) => void
}) {
  const add = () => onChange([...filters, ''])
  const set = (i: number, v: string) => onChange(filters.map((f, idx) => idx === i ? v : f))
  const remove = (i: number) => onChange(filters.filter((_, idx) => idx !== i))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-zinc-300">{label}</div>
          <div className="text-[11px] text-zinc-600">{hint}</div>
        </div>
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[11px] font-medium text-zinc-300 transition-colors"
        >
          <Plus size={11} /> Add
        </button>
      </div>
      {filters.length === 0 ? (
        <div className="text-[11px] text-zinc-600 italic px-3 py-4 text-center bg-zinc-950/40 rounded-lg border border-zinc-800/40">
          No filters — all transactions accepted
        </div>
      ) : (
        <div className="space-y-2">
          {filters.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <textarea
                value={f}
                onChange={e => set(i, e.target.value)}
                placeholder="(tx) => true"
                rows={2}
                className="flex-1 bg-zinc-950/60 border border-zinc-800/60 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
              />
              <button
                onClick={() => remove(i)}
                className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
