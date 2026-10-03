import { LayoutDashboard, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

type SidebarProps = {
  activePath?: string
}

/**
 * Sidebar navigasi sederhana untuk DashboardLayout.
 * Router-agnostic: tidak wajib react-router-dom.
 * Isi `activePath` (mis. dari router) untuk menandai item aktif,
 * kalau kosong fallback ke `window.location.pathname`.
 */
export function Sidebar({ activePath }: SidebarProps) {
  const current =
    activePath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 border-r border-border-subtle bg-surface-card p-4">
      <p className="px-2 font-label-md text-label-md uppercase tracking-wider text-text-secondary">
        Menu
      </p>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = current === item.href
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2 font-body-md text-body-md transition-colors',
                isActive
                  ? 'bg-surface-container font-semibold text-text-primary'
                  : 'text-text-secondary hover:bg-surface-container-low hover:text-text-primary',
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </a>
          )
        })}
      </nav>
    </aside>
  )
}
