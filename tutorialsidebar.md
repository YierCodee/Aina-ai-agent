# Tutorial: Membuat Sidebar Manual (React + Vite + Tailwind)

Panduan ini menjelaskan cara membuat sidebar **manual dari nol** (tanpa `shadcn sidebar`, tanpa lib sidebar) di proyek ini. Cocok untuk belajar konsep dasar: `state open/close`, layout, dan responsive.

> Hasil akhir: `src/components/sidebar/ManualSidebar.tsx` yang bisa dibuka/tutup, dipakai di `src/layouts/AppLayout.tsx`.

---

## 0. Peta File — Buat Apa, Di Mana, Kenapa

| # | File yang dibuat / disentuh | Di mana | Kenapa di sana |
|---|-----------------------------|---------|----------------|
| 1 | `src/data/manualNav.ts` | `src/data/` | Data = sumber kebenaran menu. Dipisah dari UI supaya gampang diubah tanpa sentuh komponen. Ikuti pola existing: `src/data/chats.ts`, `src/data/files.ts`. |
| 2 | `src/components/sidebar/ManualSidebar.tsx` | `src/components/sidebar/` | Semua sidebar existing ada di sini (`ChatSidebar.tsx`, `SidebarGroup.tsx`). Satu folder = satu tanggung jawab, gampang dicari. |
| 3 | `src/components/sidebar/ManualSidebarItem.tsx` (opsional) | `src/components/sidebar/` | Pecah item kecil supaya `ManualSidebar.tsx` tidak bengkak. Pola yang sama dipakai `ChatListItem.tsx`. |
| 4 | `src/hooks/useManualSidebar.ts` (opsional) | `src/hooks/` | Logic `open/close` + `Esc untuk tutup` + `default terbuka di desktop` dipisah jadi hook. Ikuti pola `useSidebarWidth.ts`, `useSidebarOffset.ts`. Bisa juga pakai `useState` langsung kalau mau super simpel. |
| 5 | `src/layouts/AppLayout.tsx` (edit, 5 baris) | `src/layouts/` | Layout adalah satu-satunya tempat yang mengatur posisi sidebar vs konten. Jangan taruh layout di dalam sidebar itu sendiri. |
| 6 | `src/index.css` (edit, 3 baris, opsional) | `src/` | Variabel global `--sbw` (lebar sidebar) dan `--rail-w` (lebar rail ikon) tinggal di `:root`. Supaya konten bisa `pl-[var(--sbw)]` dan ikut bergeser. |

Struktur akhir:

```
src/
  data/manualNav.ts                  <- daftar menu
  components/sidebar/
    ManualSidebar.tsx                <- komponen utama
    ManualSidebarItem.tsx            <- satu baris menu (opsional tapi disarankan)
  hooks/useManualSidebar.ts          <- state open/close (opsional)
  layouts/AppLayout.tsx              <- pasang sidebar + geser konten
  index.css                          <- variabel --sbw (opsional)
```

---

## Langkah 1 — Buat data menu

**File:** `src/data/manualNav.ts`
**Kenapa file baru:** supaya tambah/hapus menu tidak perlu buka file UI.

```ts
// src/data/manualNav.ts
import { Home, FolderOpen, CheckSquare, BookOpen, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ManualNavItem = {
  id: string
  label: string
  icon: LucideIcon
}

export const MANUAL_NAV: ManualNavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
]
```

> `lucide-react` sudah ada di `package.json`, jadi tidak perlu install.

---

## Langkah 2 — Buat komponen item (satu baris menu)

**File:** `src/components/sidebar/ManualSidebarItem.tsx`
**Kenapa dipisah:** `ManualSidebar.tsx` tetap pendek, fokus ke kerangka (header/list/footer). Styling active state hanya ada di satu tempat.

```tsx
// src/components/sidebar/ManualSidebarItem.tsx
import type { ManualNavItem } from '@/data/manualNav'
import { cn } from '@/utils/cn'

type Props = {
  item: ManualNavItem
  active: boolean
  collapsed: boolean
  onSelect: (id: string) => void
}

export function ManualSidebarItem({ item, active, collapsed, onSelect }: Props) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-body-md transition-colors',
        active
          ? 'bg-surface-container-high font-semibold text-text-primary'
          : 'text-text-secondary hover:bg-surface-container-low hover:text-text-primary',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  )
}
```

Catatan:
- `cn()` dari `@/utils/cn` sudah ada (dipakai `ChatSidebar.tsx`). Jangan concat string manual.
- Token warna (`bg-surface-container-high`, `text-text-secondary`) berasal dari `@theme` di `src/index.css`. Jangan hardcode hex.

---

## Langkah 3 — Buat komponen sidebar utama

**File:** `src/components/sidebar/ManualSidebar.tsx`
**Kenapa di folder ini:** konsisten dengan `ChatSidebar.tsx`. Props dibuat minimal: `open`, `onClose`, `activeId`, `onSelect`.

```tsx
// src/components/sidebar/ManualSidebar.tsx
import { PanelLeftClose, Plus } from 'lucide-react'
import { MANUAL_NAV } from '@/data/manualNav'
import { ManualSidebarItem } from './ManualSidebarItem'
import { cn } from '@/utils/cn'

type Props = {
  open: boolean
  activeId: string
  collapsed?: boolean
  onSelect: (id: string) => void
  onClose: () => void
  onNew?: () => void
}

export function ManualSidebar({ open, activeId, collapsed = false, onSelect, onClose, onNew }: Props) {
  return (
    <>
      {/* Overlay gelap — hanya mobile saat sidebar terbuka */}
      {open && (
        <button
          type="button"
          aria-label="Tutup sidebar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        aria-label="Navigasi utama"
        aria-hidden={!open}
        className={cn(
          'fixed left-0 top-0 z-40 flex h-full flex-col border-r border-border-subtle bg-surface-card transition-transform duration-200',
          collapsed ? 'w-[72px]' : 'w-[260px]',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-[72px]',
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          {!collapsed && open && <span className="font-headline-sm text-headline-sm font-semibold">Menu</span>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Sembunyikan sidebar"
            className="flex size-8 items-center justify-center rounded-full hover:bg-surface-container"
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </button>
        </div>

        {onNew && (
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={onNew}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-on-primary text-body-md font-semibold hover:opacity-90"
            >
              <Plus className="size-4" aria-hidden="true" />
              {!collapsed && open && <span>Baru</span>}
            </button>
          </div>
        )}

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
          {MANUAL_NAV.map((item) => (
            <ManualSidebarItem
              key={item.id}
              item={item}
              active={item.id === activeId}
              collapsed={collapsed || !open}
              onSelect={onSelect}
            />
          ))}
        </nav>
      </aside>
    </>
  )
}
```

Tiga konsep penting di sini:
1. **`fixed` + `translate-x`** — sidebar menempel di kiri, animasi geser pakai transform (murah, tidak trigger reflow).
2. **`md:` breakpoint** — di mobile jadi drawer (overlay), di desktop selalu terlihat. Ini pola yang sama dipakai `ChatSidebar.tsx` via `SidebarTransition`.
3. **`aria-label` / `aria-hidden`** — pembaca layar tahu ini navigasi, dan tahu saat sidebar disembunyikan.

---

## Langkah 4 — (Opsional tapi disarankan) Bungkus state jadi hook

**File:** `src/hooks/useManualSidebar.ts`
**Kenapa hook:** `AppLayout.tsx` sudah penuh state (`sidebarOpen`, `draft`, `messages`). Hook membuat logika buka/tutup + tombol `Esc` bisa dipakai ulang. Kalau mau versi paling simpel, lewati langkah ini dan pakai `useState` langsung di layout.

```ts
// src/hooks/useManualSidebar.ts
import { useCallback, useEffect, useState } from 'react'

export function useManualSidebar() {
  // Terbuka default di desktop (>=768px), tertutup di mobile — sama seperti AppLayout existing.
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 768,
  )
  const [activeId, setActiveId] = useState('home')

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])
  const select = useCallback((id: string) => {
    setActiveId(id)
    if (window.innerWidth < 768) setOpen(false) // drawer auto-tutup setelah pilih menu
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open ])

  return { open, activeId, toggle, close, select }
}
```

---

## Langkah 5 — Pasang di layout

**File:** `src/layouts/AppLayout.tsx` (edit kecil)
**Kenapa di layout:** hanya layout yang tahu kapan konten harus bergeser. Sidebar tidak boleh mengatur margin konten sendiri.

```tsx
// di atas, tambah import:
import { ManualSidebar } from '../components/sidebar/ManualSidebar'
import { useManualSidebar } from '../hooks/useManualSidebar'

// di dalam function AppLayout():
const { open, activeId, toggle, close, select } = useManualSidebar()

// di dalam return, sebelum konten utama:
<ManualSidebar
  open={open}
  activeId={activeId}
  onSelect={select}
  onClose={close}
  onNew={() => console.log('new clicked')}
/ />

<button type="button" onClick={toggle}>Toggle sidebar</button>

// geser konten saat sidebar terbuka (desktop saja):
<div className={open ? 'md:pl-[260px]' : 'md:pl-[72px]'}>
  {/* isi halaman */}
</div>
```

> Proyek existing memakai variabel `--sbw` + `pl-[var(--sbw)]` untuk sinkron lebar drag + `FixedLayer`. Untuk sidebar manual, `md:pl-[260px]` / `md:pl-[72px]` sudah cukup. Naik ke `--sbw` hanya kalau nanti tambah fitur drag-resize seperti `useSidebarWidth.ts`.

---

## Langkah 6 — Jalankan & cek

```bash
npm run dev
# buka http://localhost:5173
```

Checklist:
- [ ] Klik menu → `activeId` pindah, style active ikut.
- [ ] Klik tombol hide → sidebar meluncur ke kiri (mobile) / menyempit (desktop).
- [ ] Tekan `Esc` → drawer tertutup (mobile).
- [ ] Resize ke <768px → sidebar jadi overlay gelap, bukan mendorong konten.
- [ ] `npm run build` lolos tanpa error TS.

---

## Pertanyaan umum

**Kenapa tidak edit `ChatSidebar.tsx` langsung?**
Untuk belajar, file baru lebih aman — `ChatSidebar` dipakai banyak halaman (`chat`, `files`, `tasks`). Kalau rusak, semua halaman ikut rusak. Setelah paham, kamu bisa migrasi pola ini ke `ChatSidebar`.

**Kenapa tidak pakai lib sidebar?**
Lib menyembunyikan konsep `open`, `translate`, `breakpoint`. Sidebar manual = ~80 baris dan kamu paham penuh. Nanti kalau butuh drag-resize / animasi kompleks, contek `ChatSidebar.tsx` + `useSidebarWidth.ts` + `SidebarTransition`.

**Mau lanjut ke apa?**
1. Tambah `collapsed` permanen (ikon saja) untuk desktop.
2. Tambah grup menu seperti `SidebarGroup.tsx` (Today / Yesterday).
3. Tambah drag-resize dengan meniru `useSidebarWidth.ts` (pointer events + `aria-valuenow`).
