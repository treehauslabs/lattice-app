# Reactive State Refactor

## Problem

Balances and other chain-derived data are inconsistent across pages, and lag behind block acceptance.

Each page owns its own polling loop and its own copy of state:

| Consumer | Polls | State owner |
|---|---|---|
| `useNode` | `getChainInfo + getPeers` every 5s | `useNode` |
| `Wallet.tsx` | `getBalance` all accounts × all chains every 10s | `Wallet` |
| `Trading.tsx` | `getBalance` active account × all chains every 8s | `Trading` |
| `BuyView` (Trading) | `listDeposits` every 10s | `BuyView` |
| `Explorer.tsx` | `getBalance` on account/chains change | `Explorer` |

Wallet and Trading can show different numbers for the same `(address, chain)` because their intervals land on different blocks. Sending a tx doesn't visibly update anything until the next tick. A newly accepted block doesn't propagate — balances update only when a timer fires.

## Goal

Every rendered value that is a function of node state updates as soon as the node state changes. Pages don't own chain-derived state; they read from a shared cache driven by block events.

## Approach

Two pieces, no custom infrastructure:

1. **Consume the SSE stream the node already exposes.** `GET /ws?events=newBlock,newTransaction,chainReorg,syncStatus` is live (see `Subscriptions.swift`, `RPCServer.swift:1135`). The app has never connected to it.
2. **Adopt React Query** as the cache. On every `newBlock(directory)` event, call `queryClient.invalidateQueries({ queryKey: ['balance', *, directory] })` (and equivalents for other chain-scoped queries). React Query handles subscribers, dedup, refetch — all the mechanics we'd otherwise hand-roll.

That's the whole design. No custom stores, no `useSyncExternalStore`, no provider-per-domain.

## Prerequisite: verify EventSource works in Tauri

The Tauri webview uses the OS-native WebKit/WebView2 `EventSource`, which is separate from `@tauri-apps/plugin-http`. Cookies and headers from `plugin-http` are not shared. Before committing to SSE:

- Spin up the node, open the Tauri app, run in devtools:

  ```js
  const es = new EventSource('http://127.0.0.1:8080/ws?events=newBlock')
  es.onmessage = e => console.log('frame', e.data)
  es.onerror = e => console.log('err', e)
  ```

- Mine a block, confirm a frame arrives.

If it works: proceed. If it doesn't (CORS, auth, or webview quirk): either drop auth on `/ws` for loopback, expose a `?token=` query param on the node, or poll `getChainInfo` heights on a single shared tick and invalidate on height changes. The rest of the design stays the same; only the event source changes.

Cookie auth is the most likely blocker — `EventSource` won't send custom headers, and the Tauri webview and `plugin-http` don't share a cookie jar. Simplest fix: on loopback, `/ws` accepts a `?token=` query param matching the cookie value.

## Implementation

### 1. Add React Query

```bash
npm install @tanstack/react-query
```

Wrap `AppProviders`:

```tsx
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
})

<QueryClientProvider client={queryClient}>
  <AppProviders>...</AppProviders>
</QueryClientProvider>
```

`staleTime: Infinity` — we don't want background refetches; invalidation is driven by block events.

### 2. Add `useNodeEvents` — the single SSE consumer

```ts
// src/realtime/useNodeEvents.ts
export function useNodeEvents() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const es = new EventSource(`${baseUrl}/ws?events=newBlock,newTransaction,chainReorg,syncStatus${token ? `&token=${token}` : ''}`)

    es.onmessage = (e) => {
      const { event, data } = JSON.parse(e.data)
      switch (event) {
        case 'newBlock':
          queryClient.invalidateQueries({ queryKey: ['balance', undefined, data.directory], exact: false })
          queryClient.invalidateQueries({ queryKey: ['nonce', undefined, data.directory], exact: false })
          queryClient.invalidateQueries({ queryKey: ['chains'] })
          queryClient.invalidateQueries({ queryKey: ['deposits', data.directory] })
          queryClient.invalidateQueries({ queryKey: ['mempool', data.directory] })
          queryClient.invalidateQueries({ queryKey: ['latestBlock', data.directory] })
          break
        case 'newTransaction':
          queryClient.invalidateQueries({ queryKey: ['mempool'] })
          break
        case 'chainReorg':
          queryClient.invalidateQueries()  // blunt; reorgs are rare and dangerous
          break
      }
    }

    es.onerror = () => {/* EventSource auto-reconnects */}

    return () => es.close()
  }, [queryClient, baseUrl, token])
}
```

Mount it once near the root (inside `AppProviders`).

### 3. Convert balance reads

This is the only change required to fix the reported bug.

```tsx
// Before, in Wallet.tsx
const [balances, setBalances] = useState<Record<string, Record<string, number>>>({})
useEffect(() => {
  const fetch = async () => { /* nested loop, 10s interval */ }
  fetch(); const iv = setInterval(fetch, 10000); return () => clearInterval(iv)
}, [connected, accounts, chains.length])

// After
function useBalance(address?: string, chain?: string) {
  return useQuery({
    queryKey: ['balance', address, chain],
    queryFn: () => lattice.getBalance(address!, chain!).then(r => r.balance),
    enabled: !!address && !!chain,
  })
}
```

Migrate the three balance call sites (`Wallet.tsx:398`, `Trading.tsx:36`, `Explorer.tsx:727`) to `useBalance`. Delete the local `balances` state and intervals. Same data comes from one cache; `newBlock` events invalidate it.

### 4. Convert the rest opportunistically

Same pattern for `useChains`, `useMempool`, `useDeposits`, `useNonce`, `useLatestBlock`, `useFeeEstimate`. Each is a few lines. Do them as the files get touched; not a prerequisite to closing the bug.

## Write-path invalidation

Do **not** invalidate balances on `submitTransaction` success. `resp.accepted` means the mempool took the tx, not that the balance has changed. Invalidating here fires a refetch that returns the pre-tx value; the real update comes from the `newBlock` event that carries the tx's receipt — already handled by `useNodeEvents`.

What *is* worth invalidating on successful submit:

- `mempool` for that chain — the tx is now pending.
- `nonce` for `(from, chain)` — the next tx should use `nonce + 1`, and React Query's cached value is now stale.

```ts
async function submit(signed: SubmitTransactionRequest, chain: string, from: string) {
  const resp = await lattice.submitTransaction(signed, chain)
  if (resp.accepted) {
    queryClient.invalidateQueries({ queryKey: ['mempool', chain] })
    queryClient.invalidateQueries({ queryKey: ['nonce', from, chain] })
  }
  return resp
}
```

## Migration

1. Verify `EventSource` works against `/ws` in the Tauri webview (above). If not, add `?token=` auth on node side and retry.
2. Add React Query + `useNodeEvents`.
3. Add `useBalance`; migrate Wallet, Trading, Explorer. Delete their balance state and intervals. **This closes the reported bug.**
4. Convert other reads opportunistically when touching those files.

Steps 2 and 3 together are roughly one day of work.

## What this explicitly doesn't do

- No custom reactive store layer.
- No change to the node's event schema — `newBlock(hash, height, directory, timestamp)` is enough; we refetch on the event rather than embedding deltas.
- No change to write APIs, signing, or keystore.
- No optimistic balance math.

## Tradeoffs

- Adds one dependency (`@tanstack/react-query`, ~13KB gzipped). Replaces hand-rolled polling in every page.
- One persistent SSE connection. Replaces five independent timers.
- React Query is familiar to web devs; the hand-rolled-store alternative requires documentation and maintenance.
- `?token=` in a URL is a mild smell (logs, history). Acceptable on loopback; don't use this pattern if we ever expose the node publicly.
