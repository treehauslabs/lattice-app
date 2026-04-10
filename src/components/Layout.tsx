import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Search, Wallet, ArrowLeftRight, Server, Settings, Circle } from 'lucide-react'
import { useNode } from '../hooks/useNode'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/explorer', icon: Search, label: 'Explorer' },
  { to: '/wallet', icon: Wallet, label: 'Wallet' },
  { to: '/trading', icon: ArrowLeftRight, label: 'Trading' },
  { to: '/node', icon: Server, label: 'Node' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Layout() {
  const { connected, chains, selectedChain, setSelectedChain } = useNode()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-bold tracking-tight text-lattice-400">Lattice</h1>
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <Circle
              size={8}
              className={connected ? 'fill-emerald-400 text-emerald-400' : 'fill-red-400 text-red-400'}
            />
            <span className="text-zinc-400">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Chain selector */}
        {chains.length > 0 && (
          <div className="px-3 py-2 border-b border-zinc-800">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Chain</label>
            <select
              value={selectedChain}
              onChange={e => setSelectedChain(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-lattice-500"
            >
              {chains.map(c => (
                <option key={c.directory} value={c.directory}>{c.directory}</option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-lattice-600/20 text-lattice-400'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Chain status footer */}
        {chains.length > 0 && (
          <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500 space-y-1">
            {chains.map(c => (
              <div key={c.directory} className="flex justify-between">
                <span>{c.directory}</span>
                <span className="text-zinc-400">#{c.height}</span>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <Outlet />
      </main>
    </div>
  )
}
