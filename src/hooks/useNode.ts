import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { lattice } from '../api/client'
import type { ChainStatus, PeersResponse } from '../api/types'

interface NodeState {
  connected: boolean
  chains: ChainStatus[]
  peers: PeersResponse | null
  genesisHash: string
  nexus: string
  error: string | null
  refresh: () => Promise<void>
  selectedChain: string
  setSelectedChain: (chain: string) => void
}

const NodeContext = createContext<NodeState | null>(null)

export function useNodeProvider(): NodeState {
  const [connected, setConnected] = useState(false)
  const [chains, setChains] = useState<ChainStatus[]>([])
  const [peers, setPeers] = useState<PeersResponse | null>(null)
  const [genesisHash, setGenesisHash] = useState('')
  const [nexus, setNexus] = useState('Nexus')
  const [error, setError] = useState<string | null>(null)
  const [selectedChain, setSelectedChain] = useState('Nexus')

  const refresh = useCallback(async () => {
    try {
      const [info, peersData] = await Promise.all([
        lattice.getChainInfo(),
        lattice.getPeers(),
      ])
      setChains(info.chains)
      setGenesisHash(info.genesisHash)
      if (info.nexus) setNexus(info.nexus)
      setPeers(peersData)
      setConnected(true)
      setError(null)
    } catch (e) {
      setConnected(false)
      setError(e instanceof Error ? e.message : 'Connection failed')
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  return { connected, chains, peers, genesisHash, nexus, error, refresh, selectedChain, setSelectedChain }
}

export const NodeProvider = NodeContext.Provider

export function useNode(): NodeState {
  const ctx = useContext(NodeContext)
  if (!ctx) throw new Error('useNode must be used within NodeProvider')
  return ctx
}
