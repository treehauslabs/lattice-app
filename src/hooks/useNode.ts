import { useCallback, useState, createContext, useContext } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ChainStatus, PeersResponse } from '../api/types'
import { qk, useChainsInfo, usePeers } from './queries'

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
  const queryClient = useQueryClient()
  const chainsQuery = useChainsInfo()
  const peersQuery = usePeers()
  const [selectedChain, setSelectedChain] = useState('Nexus')

  const info = chainsQuery.data
  const connected = !!info && !chainsQuery.isError
  const error = chainsQuery.error instanceof Error
    ? chainsQuery.error.message
    : chainsQuery.isError ? 'Connection failed' : null

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.chainInfo }),
      queryClient.invalidateQueries({ queryKey: qk.peers }),
    ])
  }, [queryClient])

  return {
    connected,
    chains: info?.chains ?? [],
    peers: peersQuery.data ?? null,
    genesisHash: info?.genesisHash ?? '',
    nexus: info?.nexus ?? 'Nexus',
    error,
    refresh,
    selectedChain,
    setSelectedChain,
  }
}

export const NodeProvider = NodeContext.Provider

export function useNode(): NodeState {
  const ctx = useContext(NodeContext)
  if (!ctx) throw new Error('useNode must be used within NodeProvider')
  return ctx
}
