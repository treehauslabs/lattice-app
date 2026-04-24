import { useQuery, type QueryClient } from '@tanstack/react-query'
import { lattice } from '../api/client'
import type {
  BlockInfo,
  ChainInfoResponse,
  DepositsListResponse,
  FeeEstimate,
  MempoolInfo,
  PeersResponse,
} from '../api/types'

export const qk = {
  chainInfo: ['chainInfo'] as const,
  peers: ['peers'] as const,
  balance: (address?: string, chain?: string) => ['balance', address ?? null, chain ?? null] as const,
  nonce: (address?: string, chain?: string) => ['nonce', address ?? null, chain ?? null] as const,
  mempool: (chain?: string) => ['mempool', chain ?? null] as const,
  deposits: (chain?: string) => ['deposits', chain ?? null] as const,
  feeEstimate: (target: number, chain?: string) => ['feeEstimate', target, chain ?? null] as const,
  latestBlock: (chain?: string) => ['latestBlock', chain ?? null] as const,
  accountState: (address?: string, chain?: string) => ['accountState', address ?? null, chain ?? null] as const,
}

export function useChainsInfo() {
  return useQuery<ChainInfoResponse>({
    queryKey: qk.chainInfo,
    queryFn: () => lattice.getChainInfo(),
    refetchInterval: 5000,
    staleTime: 2000,
  })
}

export function usePeers() {
  return useQuery<PeersResponse>({
    queryKey: qk.peers,
    queryFn: () => lattice.getPeers(),
    refetchInterval: 5000,
    staleTime: 2000,
  })
}

export function useBalance(address?: string, chain?: string) {
  return useQuery<number>({
    queryKey: qk.balance(address, chain),
    queryFn: async () => (await lattice.getBalance(address!, chain!)).balance,
    enabled: !!address && !!chain,
    staleTime: Infinity,
  })
}

export function useNonce(address?: string, chain?: string) {
  return useQuery<number>({
    queryKey: qk.nonce(address, chain),
    queryFn: async () => (await lattice.getNonce(address!, chain!)).nonce,
    enabled: !!address && !!chain,
    staleTime: Infinity,
  })
}

export function useMempool(chain?: string) {
  return useQuery<MempoolInfo>({
    queryKey: qk.mempool(chain),
    queryFn: () => lattice.getMempool(chain),
    enabled: !!chain,
    staleTime: Infinity,
  })
}

export function useDeposits(chain?: string) {
  return useQuery<DepositsListResponse>({
    queryKey: qk.deposits(chain),
    queryFn: () => lattice.listDeposits(chain!),
    enabled: !!chain,
    staleTime: Infinity,
  })
}

export function useFeeEstimate(target: number, chain?: string) {
  return useQuery<FeeEstimate>({
    queryKey: qk.feeEstimate(target, chain),
    queryFn: () => lattice.getFeeEstimate(target, chain),
    enabled: !!chain,
    staleTime: 30000,
  })
}

export function useLatestBlock(chain?: string) {
  return useQuery<BlockInfo>({
    queryKey: qk.latestBlock(chain),
    queryFn: () => lattice.getLatestBlock(chain),
    enabled: !!chain,
    staleTime: Infinity,
  })
}

export function invalidateChainScoped(client: QueryClient, directory: string) {
  const predicate = (queryKey: readonly unknown[], dirIndex: number) =>
    queryKey[dirIndex] === directory || queryKey[dirIndex] === null
  client.invalidateQueries({
    predicate: q => {
      const k = q.queryKey
      if (!Array.isArray(k) || k.length === 0) return false
      switch (k[0]) {
        case 'balance': return predicate(k, 2)
        case 'nonce': return predicate(k, 2)
        case 'mempool': return predicate(k, 1)
        case 'deposits': return predicate(k, 1)
        case 'latestBlock': return predicate(k, 1)
        case 'accountState': return predicate(k, 2)
        default: return false
      }
    },
  })
}
