import { useNode } from '../hooks/useNode'

export function ChainSelector({ className = '' }: { className?: string }) {
  const { chains, selectedChain, setSelectedChain } = useNode()

  if (chains.length <= 1) return null

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {chains.map(c => (
        <button
          key={c.directory}
          onClick={() => setSelectedChain(c.directory)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            selectedChain === c.directory
              ? 'bg-lattice-600/20 text-lattice-400 border border-lattice-600/40'
              : 'text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700'
          }`}
        >
          {c.directory}
        </button>
      ))}
    </div>
  )
}
