import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Globe, Shield, Trash2, Save } from 'lucide-react'
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
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Connection */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Globe size={16} className="text-lattice-400" /> Connection
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">RPC URL (leave empty for same-origin)</label>
            <input
              value={rpcUrl}
              onChange={e => setRpcUrl(e.target.value)}
              placeholder="http://127.0.0.1:8080"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-lattice-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Auth Token (optional, from .cookie file)</label>
            <input
              value={authToken}
              onChange={e => setAuthToken(e.target.value)}
              type="password"
              placeholder="Bearer token"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-lattice-500"
            />
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-lattice-600 hover:bg-lattice-700 rounded-lg text-sm font-medium"
          >
            <Save size={14} /> {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Security */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Shield size={16} className="text-lattice-400" /> Security
        </h2>
        <div className="text-sm text-zinc-400 space-y-2 mb-4">
          <p>Private keys are encrypted with AES-256-GCM using a password-derived key (PBKDF2, 600k iterations).</p>
          <p>Keys never leave your browser. Transaction signing happens entirely client-side using secp256k1 ECDSA.</p>
          <p>The CID of the transaction body (which is what gets signed) is computed server-side via the <code className="text-lattice-400">/api/transaction/prepare</code> endpoint to ensure CID compatibility with the node.</p>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-zinc-900 border border-red-900/30 rounded-lg p-4">
        <h2 className="font-semibold mb-3 text-red-400 flex items-center gap-2">
          <Trash2 size={16} /> Danger Zone
        </h2>
        <p className="text-sm text-zinc-400 mb-3">
          Delete all wallet data from this browser. This is irreversible.
        </p>
        <button
          onClick={handleClearWallet}
          className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-sm font-medium"
        >
          Clear Wallet Data
        </button>
      </div>
    </div>
  )
}
