import { NavLink, Outlet } from 'react-router-dom'
import { Compass, Wallet, ArrowLeftRight, Server, Settings, Pickaxe, Activity } from 'lucide-react'
import { useNode } from '../hooks/useNode'

const nav = [
  { to: '/', icon: Compass, label: 'Explorer' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/trading', icon: ArrowLeftRight, label: 'Exchange' },
  { to: '/node', icon: Server, label: 'Node' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Layout() {
  const { connected, chains, selectedChain, setSelectedChain } = useNode()

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-zinc-950 border-r border-zinc-800/60 flex flex-col">
        {/* Logo */}
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-lg font-bold tracking-tight text-white">Lattice</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="text-[11px] text-zinc-500">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Chain selector */}
        {chains.length > 1 ? (
          <div className="px-3 pb-3">
            <div className="space-y-0.5">
              {chains.map(c => (
                <button
                  key={c.directory}
                  onClick={() => setSelectedChain(c.directory)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                    selectedChain === c.directory
                      ? 'bg-lattice-600/10 text-lattice-400'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {c.mining && <Pickaxe size={10} className="text-emerald-400" />}
                    {c.syncing && <Activity size={10} className="text-yellow-400" />}
                    <span className="font-medium">{c.directory}</span>
                  </div>
                  <span className="text-[10px] text-zinc-600 tabular-nums">#{c.height}</span>
                </button>
              ))}
            </div>
          </div>
        ) : chains.length === 1 && (
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-lattice-400">
                {chains[0].mining && <Pickaxe size={10} className="text-emerald-400" />}
                <span className="font-medium">{chains[0].directory}</span>
              </div>
              <span className="text-zinc-600 tabular-nums">#{chains[0].height}</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 pt-2 space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-800/80 text-white'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-zinc-950">
        <Outlet />
      </main>
    </div>
  )
}
