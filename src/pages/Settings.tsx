import { useState, useEffect } from 'react'
import { Globe, Shield, Trash2, Save, CheckCircle2 } from 'lucide-react'
import { lattice } from '../api/client'

const RPC_URL_KEY = 'lattice_rpc_url'
const AUTH_TOKEN_KEY = 'lattice_auth_token'

export function SettingsPage() {
  const [rpcUrl, setRpcUrl] = useState(() => localStorage.getItem(RPC_URL_KEY) || '')
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || '')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    if (rpcUrl.trim()) {
      localStorage.setItem(RPC_URL_KEY, rpcUrl.trim())
      lattice.setBaseUrl(rpcUrl.trim())
    } else {
      localStorage.removeItem(RPC_URL_KEY)
      lattice.setBaseUrl('')
    }
    if (authToken.trim()) {
      localStorage.setItem(AUTH_TOKEN_KEY, authToken.trim())
      lattice.setAuthToken(authToken.trim())
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      lattice.setAuthToken(null)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearWallet = () => {
    if (confirm('This will delete all wallet accounts from this browser. Private keys will be permanently lost unless backed up. Continue?')) {
      localStorage.removeItem('lattice_keystore')
      window.location.reload()
    }
  }

  useEffect(() => {
    const url = localStorage.getItem(RPC_URL_KEY)
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (url) lattice.setBaseUrl(url)
    if (token) lattice.setAuthToken(token)
  }, [])

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Connection */}
      <div className="bg-zinc-900/80 rounded-2xl p-5 mb-4">
        <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Globe size={14} className="text-lattice-400" /> Connection
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">RPC URL (leave empty for same-origin)</label>
            <input
              value={rpcUrl}
              onChange={e => setRpcUrl(e.target.value)}
              placeholder="http://127.0.0.1:8080"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
            />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 block mb-1">Auth Token (optional)</label>
            <input
              value={authToken}
              onChange={e => setAuthToken(e.target.value)}
              type="password"
              placeholder="From .cookie file"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-lattice-500 placeholder:text-zinc-600"
            />
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-lattice-600 hover:bg-lattice-500 rounded-xl text-sm font-semibold transition-colors"
          >
            {saved ? <><CheckCircle2 size={14} /> Saved</> : <><Save size={14} /> Save</>}
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="bg-zinc-900/80 rounded-2xl p-5 mb-4">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Shield size={14} className="text-lattice-400" /> Security
        </h2>
        <div className="text-sm text-zinc-400 space-y-2 leading-relaxed">
          <p>Private keys are encrypted with AES-256-GCM using a password-derived key (PBKDF2, 600k iterations).</p>
          <p>Keys never leave your browser. Transaction signing happens entirely client-side using secp256k1 ECDSA.</p>
          <p>Transaction body CIDs are computed server-side via the prepare endpoint to ensure compatibility.</p>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-zinc-900/80 rounded-2xl p-5 border border-red-900/20">
        <h2 className="font-semibold text-sm mb-3 text-red-400 flex items-center gap-2">
          <Trash2 size={14} /> Danger Zone
        </h2>
        <p className="text-sm text-zinc-400 mb-4">
          Delete all wallet data from this browser. This is irreversible.
        </p>
        <button
          onClick={handleClearWallet}
          className="px-5 py-2.5 bg-red-600/15 text-red-400 hover:bg-red-600/25 rounded-xl text-sm font-semibold transition-colors"
        >
          Clear Wallet Data
        </button>
      </div>
    </div>
  )
}
