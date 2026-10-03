import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { cn } from '@/lib/utils'

type DashboardLayoutProps = {
  children: ReactNode
  className?: string
}

/**
 * Layout 2 kolom untuk halaman dashboard:
 * sidebar kiri + konten utama.
 */
export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <div className={cn('flex min-h-screen bg-canvas-background', className)}>
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
