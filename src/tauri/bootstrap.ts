import { lattice } from '../api/client'

type NodeStatus =
  | { kind: 'pending' }
  | { kind: 'external'; baseUrl: string }
  | { kind: 'managed'; baseUrl: string; authToken: string | null; dataDir: string }
  | { kind: 'failed'; reason: string }

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function readNodeIdentity(): Promise<string | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string | null>('read_node_identity')
}

export async function bootstrapFromTauri(): Promise<NodeStatus | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')

  const apply = (status: NodeStatus) => {
    if (status.kind === 'external' || status.kind === 'managed') {
      lattice.setBaseUrl(status.baseUrl)
      localStorage.setItem('lattice_rpc_url', status.baseUrl)
      if (status.kind === 'managed' && status.authToken) {
        lattice.setAuthToken(status.authToken)
        localStorage.setItem('lattice_auth_token', status.authToken)
      }
    }
  }

  listen<NodeStatus>('node://status', (e) => apply(e.payload))

  const initial = await invoke<NodeStatus>('get_node_status')
  apply(initial)

  return initial
}
