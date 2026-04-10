import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Explorer } from './pages/Explorer'
import { WalletPage } from './pages/Wallet'
import { Trading } from './pages/Trading'
import { NodeControl } from './pages/NodeControl'
import { SettingsPage } from './pages/Settings'
import { NodeProvider, useNodeProvider } from './hooks/useNode'
import { WalletProvider, useWalletProvider } from './hooks/useWallet'
import { useEffect } from 'react'
import { lattice } from './api/client'

function AppProviders({ children }: { children: React.ReactNode }) {
  const node = useNodeProvider()
  const wallet = useWalletProvider()

  useEffect(() => {
    const url = localStorage.getItem('lattice_rpc_url')
    const token = localStorage.getItem('lattice_auth_token')
    if (url) lattice.setBaseUrl(url)
    if (token) lattice.setAuthToken(token)
  }, [])

  return (
    <NodeProvider value={node}>
      <WalletProvider value={wallet}>
        {children}
      </WalletProvider>
    </NodeProvider>
  )
}

export function App() {
  return (
    <AppProviders>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="explorer" element={<Explorer />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="trading" element={<Trading />} />
          <Route path="node" element={<NodeControl />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AppProviders>
  )
}
