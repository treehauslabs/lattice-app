import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { lattice } from '../api/client'
import { invalidateChainScoped, qk, useChainsInfo } from '../hooks/queries'

interface NodeEventEnvelope {
  event: string
  data: {
    directory?: string
    hash?: string
    height?: number
    cid?: string
    depth?: number
  }
}

export function useNodeEvents() {
  const queryClient = useQueryClient()
  const { data: chainInfo } = useChainsInfo()
  const lastHeights = useRef<Record<string, number>>({})
  const esRef = useRef<EventSource | null>(null)
  const sseUp = useRef(false)

  // SSE primary path.
  useEffect(() => {
    const baseUrl = lattice.getBaseUrl()
    if (!baseUrl) return
    const token = lattice.getAuthToken()

    const url = new URL(`${baseUrl.replace(/\/$/, '')}/ws`)
    url.searchParams.set('events', 'newBlock,newTransaction,chainReorg,syncStatus')
    if (token) url.searchParams.set('token', token)

    let closed = false
    const es = new EventSource(url.toString())
    esRef.current = es

    es.onopen = () => { sseUp.current = true }
    es.onerror = () => { sseUp.current = false }
    es.onmessage = (e) => {
      let env: NodeEventEnvelope
      try { env = JSON.parse(e.data) } catch { return }
      const dir = env.data.directory
      switch (env.event) {
        case 'newBlock':
          if (dir) invalidateChainScoped(queryClient, dir)
          queryClient.invalidateQueries({ queryKey: qk.chainInfo })
          break
        case 'newTransaction':
          queryClient.invalidateQueries({
            predicate: q => Array.isArray(q.queryKey) && q.queryKey[0] === 'mempool',
          })
          break
        case 'chainReorg':
          if (dir) invalidateChainScoped(queryClient, dir)
          queryClient.invalidateQueries({ queryKey: qk.chainInfo })
          break
      }
    }

    return () => {
      closed = true
      sseUp.current = false
      es.close()
      esRef.current = null
      void closed
    }
  }, [queryClient])

  // Height-watch fallback. Fires when chainInfo polling observes a new height.
  // Redundant when SSE is up, but harmless — invalidate is idempotent.
  useEffect(() => {
    if (!chainInfo) return
    for (const c of chainInfo.chains) {
      const prev = lastHeights.current[c.directory]
      if (prev !== undefined && c.height !== prev) {
        invalidateChainScoped(queryClient, c.directory)
      }
      lastHeights.current[c.directory] = c.height
    }
  }, [chainInfo, queryClient])
}
