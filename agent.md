# Agent — Aturan Visual & Implementasi

Keputusan desain dan aturan implementasi hasil revisi halaman Tasks
(`src/pages/TasksPage.tsx`) dan penambahan CRUD di halaman Courses.
Dipakai sebagai acuan agen untuk menjaga konsistensi visual ke depan.

Nomor bagian 1-6 berlaku untuk Tasks, 7-11 untuk CRUD Courses.

## Arah Desain

- **Tone:** tenang-minimal, lega, fokus. Bukan playful, bukan brutalist.
- **Prinsip:** satu font, aksi hitam tunggal, biru hanya info. Hierarki lewat weight dan whitespace, bukan warna/font baru.
- **Signature:** metric card lapang (angka kecil), task row 2 baris, satu CTA solid hitam.

## 1. Tipografi — Satu Font: Manrope

- Seluruh UI memakai `Manrope (400/500/600/700/800)`. Tidak ada Inter / Plus Jakarta Sans.
- Token font di `src/index.css` (`@theme`) semuanya `"Manrope", sans-serif`.
- Font dimuat di `index.html` via Google Fonts (Manrope saja).
- Hierarki hanya lewat weight/size:
  - Judul: `600`
  - Angka metrik: `600`, `26px/32px`, `tabular-nums`, `tracking-tight`
  - Metadata: `400/500`, `13px`, `text-text-secondary`
  - Label/badge: `500/600`
- Jangan menambah font-family baru tanpa persetujuan.

## 2. Metrik (4 Card Atas) — Kecil dan Lega

- File: `src/components/tasks/TasksMetrics.tsx`
- Angka (`28, 12, 5, 74%`): `text-[26px] leading-8 font-semibold`, bukan `headline-xl 40px bold`.
- Unit pendamping (`Tasks`, `Running`, `Pending`): `body-sm` muted.
- Card: `p-6`, gap label→angka `gap-2`, footer `pt-5`. Ikon container `size-10`, ikon `size-5`, warna `text-text-secondary` (netral).
- Jangan kembalikan efek `hover:-translate-y` pada metric card.

## 3. Palet — Hitam untuk Aksi, Biru untuk Info, Merah untuk Urgent

- Aksi/CTA (Send, New Chat, New Task, Add Task, Upload, Ask): hitam `primary-container #131b2e` (hover `surface-dark`), teks `on-primary` putih.
- Info/data (progress bar, link, avatar/dot AI): biru `secondary #0058be` — bukan tombol.
- Urgent: merah `error #ba1a1a` + `error-container #ffdad6`.
- Sisanya: netral (`surface-container-low`, `text-secondary`).
- File: `src/components/ui/button.tsx`
  - `primary` = `bg-primary-container text-on-primary hover:bg-surface-dark` (hitam)
  - Ada varian `outline` (`border-border-subtle`, transparan) untuk aksi sekunder per-row
- File: `src/components/ui/badge.tsx`
  - `primary` = `bg-primary text-on-primary` (hitam)
  - `danger` = merah (hanya untuk Urgent/High)
  - `info, violet, neutral, success, warning, highlight` = semuanya netral
  - `brand` = `bg-surface-container text-secondary` (aksen biru lembut, info saja)
- File: `src/components/tasks/TaskCard.tsx` — `priorityTone`: `urgent/high → danger`, sisanya `neutral`. Jangan pakai tone ungu/hijau/amber di row.
- File: `src/components/tasks/TasksSidebar.tsx` — dot alokasi dan badge `Running` = netral.

## 4. Task Row — Wajib 2 Baris

- File: `src/components/tasks/TaskCard.tsx`
- **Baris 1:** judul (`truncate`, `headline-sm semibold`) + 1 badge prioritas.
- **Baris 2 (metadata, muted `13px text-text-secondary`):** due • subtask (`x of y done`) • assignee • max 2 tag (`+n` untuk sisa) • status AI/note sebagai teks kecil (bukan badge solid).
- Checkbox selesai = `bg-primary-container text-on-primary` (aktif = hitam).
- Assignee: avatar `16px` + nama, tanpa badge background.

## 5. CTA — Hanya "Add Task" yang Solid

- Tombol `Ask Study Buddy` / `run` per-row: `variant="outline" size="sm"` (ghost/outline, bukan solid hitam).
- Satu-satunya tombol solid di layar Tasks: `Add Task` di `TasksTopbar` (`variant="primary"`, hitam). Warna yang sama dipakai ulang di `TasksSidebar` ("New Task") — dua tombol membuka dialog yang sama.
- Jangan menambah tombol solid gelap baru per-row.

## 6. Tambah Task — Dialog, Bukan Input Mengambang

- File: `src/components/tasks/TaskCreateDialog.tsx`. Shell Radix dari `ui/dialog.tsx`, jadi **tidak** dibungkus `FixedLayer` (portal sendiri, lolos dari `filter: blur()` di `PageTransition`).
- Layout sheet: `ModalContent` `flex max-h-[85dvh] max-w-xl overflow-hidden p-0`; header/footer `shrink-0`, scroll hanya di body `scrollbar-none`. Satu-satunya solid per dialog = submit `variant="primary"`, batal `variant="outline"`; keduanya nonaktif saat `busy`.
- Reset form saat dibuka pakai penyesuaian saat render (`prevKey !== openKey → setState`), **bukan** `useEffect` — lihat Aturan 11.
- Field: judul (wajib, maks 255), prioritas, tanggal + jam (dua input terpisah; preset cepat "Hari ini EOD" / "Besok 09:00" / "Minggu depan 17:00"), workflow (`select` dari `workflows` — `id`-nya id backend asli), tags, note, tombol aksi.
- **Tag dinormalkan di client** (satu `#` di depan). Backend menyimpan nama tag verbatim lalu mencocokkan dengan `LIKE %…%` huruf kecil (`backend/services/task_service.py`) — tanpa normalisasi `#LMS` dan `#lms` jadi dua tag.
- `group` diturunkan di `TasksPage` dari `dueAt` (tenggat hari ini → `today`, selain itu → `upcoming`); backend tidak menentukannya sendiri. Tanpa tenggat → `dueAt: null` + `scheduleKind: 'continuous'`.
- Error dari `TasksApiError` ditampilkan apa adanya di dalam dialog (`bg-error-container`) — jangan ditukar jadi toast, supaya isinya tidak hilang saat user memperbaiki isian.
- Padding bawah konten **tidak** lagi menyisakan ruang untuk bar input; toast duduk di `bottom-8`.

# CRUD Mata Kuliah (Dialog & Menu)

Aturan tambahan untuk komponen yang bisa menulis data. Prinsipnya sama dengan
bagian Tasks di atas — tidak menambah warna, font, atau CTA solid baru.

## 7. Varian Tombol `danger` — Satu-satunya Merah Solid

- `src/components/ui/button.tsx` — `danger: 'bg-error text-on-error hover:opacity-90 shadow-sm'`.
- Pasangan token `--color-error` / `--color-on-error` sudah ada di `index.css` sejak awal, baru dipakai di sini. Jangan bikin warna merah baru.
- Hover pakai `opacity`, **bukan** `brightness-*`. Repo ini tidak pernah pakai brightness, dan tidak ada token "error lebih gelap" untuk ditukar.
- Pemakaian hanya boleh: konfirmasi lepas / hapus permanen. Badge `tone="danger"` tetap untuk label (Urgent/High) — dua peran berbeda, jangan dicampur.

## 8. Dialog Form — Aksi yang Jelas

- Submit: `variant="primary"` (hitam). Cancel: `variant="outline"`. Destructive: `variant="danger"`.
- **Satu tombol solid per dialog.** Kalau dialog punya tombol hapus, dia ikut nonaktif saat submit berjalan supaya tidak ada dua aksi utama sekaligus.
- Judul `font-headline-sm font-semibold`; deskripsi `body-sm text-text-secondary` (default `ModalDescription` sudah benar).
- Input: `h-10 rounded-full border border-border-subtle bg-surface-card px-4 font-body-sm`, label `label-md font-medium`, pesan error `label-sm text-error`.
- `ModalContent` di `CourseFormDialog` memakai `max-w-2xl max-h-[85dvh]` (header/footer sticky, scroll di body via `overflow-y-auto`) — form 4 seksi tidak muat di `max-w-lg` default.
- Label seksi: `label-sm uppercase tracking-wider text-text-secondary`. Jangan pakai heading besar per seksi.

## 9. Dialog Konfirmasi — Minta Pelepasan, Bukan Penghapusan

- Judul "Lepas dari semester?" — **bukan** "Hapus?". Yang terjadi `status='dropped'`: data masih ada dan bisa dipulihkan. Judul yang salah bikin pengguna mengira sedang menghapus permanen.
- `TriangleAlert` `size-5 text-error` di depan judul.
- Isi dialog wajib menyebut konsekuensi dan jalan pulihnya dalam satu kalimat.
- Tombol konfirmasi `variant="danger"` dengan label "Lepas dari semester" (bukan "Hapus").

## 10. Menu Aksi Per Kartu — `tool`, Bukan Solid

- Trigger `⋯`: `variant="tool" size="icon-sm"`, wajib `aria-label`, `aria-haspopup="menu"`, `aria-expanded`.
- Menu `role="menu"`, item `role="menuitem"`. Tutup saat klik luar atau Escape — `PageTransition` hanya meng-*animate* halaman, tidak unmount, jadi menu akan bertahan kalau tidak ditutup sendiri.
- Item destructive: `text-error hover:bg-error-container hover:text-on-error-container` — bukan `variant="danger"`, karena item menu bukan tombol utama.
- Pola dropdown absolut (tanpa komponen Radix baru) mengikuti `PinnedFolders`.
- **Jangan** menambah tombol solid per-row. Aturan "satu aksi hitam per layar" juga berlaku di Courses: CTA solid-nya tetap "Enroll" di topbar.

## 11. Form State — Jangan Pakai `useEffect` untuk Reset

- Reset form saat dialog dibuka dilakukan saat render (`prevKey !== key` → `setState`), bukan `useEffect` + `setState`. Efek memicu render kedua dan kena `react/set-state-in-effect` dari oxlint.
- Pola yang sama sudah dipakai `FilesPage` untuk reset pagination. Ikuti yang sudah ada di repo.
- Batas CHECK di database harus punya pasangan di client, supaya pesan di layar dan di server sama. Semuanya sudah ada, tapi **terbagi di dua tempat**:
  - `validate()` di `CourseFormDialog` — SKS 0-12, progres 0-100, `currentWeek` ≥ 1, serta kolom wajib.
  - `sanitizeWeeks()` di `src/data/courses.ts` — nomor minggu 1-20, judul tidak kosong, tanpa nomor duplikat. Mingguan yang gagal saring dibuang, bukan ditolak.
- Kalau batas di database berubah, ubah **keduanya**. Menambah kolom CHECK tanpa menambah validasi client hanya memindahkan error ke server.
- Error backend ditampilkan apa adanya — `coursesApi.ts` sudah menerjemahkan `detail` FastAPI ke bahasa manusia. Jangan `try/catch` lalu membuang pesannya.

## Aturan Data yang Tidak Boleh Dilanggar

- **`class_label` sudah memuat ruang** ("Kelas A (R. 301)"). `draftFromCard()` **tidak boleh** memecahnya jadi `classLabel` + `room` — itu membuat ruang hilang dari kartu saat form disimpan ulang. `room` punya kolomnya sendiri.
- **Dosen & tutor di-form diidentifikasi by-nama.** Kartu tidak membawa `id`-nya, jadi backend memakai ulang baris dengan nama sama. Kalau nanti kartu mengirim `id`, kolom `id` di `LecturerDraft`/`TutorDraft` sudah tersedia.
- **`tutor: null` berarti lepas tutor**, dan itu menurunkan `ragIsolation`. Checkbox "Tutor AI khusus" di form sudah menyebut konsekuensinya secara eksplisit — jangan dihapus.
- Setelah setiap write, `refetch()`. Jangan state optimistis: setiap write mengubah aggregate (counts, metrics) yang tidak bisa dihitung lokal tanpa meniru query SQL.

## Verifikasi

Selain `npm run build`, wajib `npx tsc -b --noEmit` bersih dan `npx oxlint src/`
0 error (2 warning di `button.tsx` + `useSidecarStatus.ts` sudah ada sebelumnya,
bukan regresi). Belum ada verifikasi visual untuk dialog — periksa 1440px dan
390px, terutama penempatan dialog saat sidebar di-drag.

---

# Animasi Transisi Halaman (Page Transition)

Dokumentasi desain & implementasi transisi pindah halaman (Opsi A: Minimal Premium).

## Filosofi
- **Smooth & premium**: feedback <150ms, total 580ms. Tidak "wow" berlebihan, tidak flicker.
- **Aksesibilitas first**: `prefers-reduced-motion` mematikan semua animasi, konten tetap muncul instan.
- **Tidak memecah layout**: elemen `position: fixed` (sidebar, toast, overlay) di-portal ke `body` supaya tidak terpengaruh `filter` pada wrapper animasi.

## Arsitektur

### Komponen Baru (`src/components/feedback/`)
| File | Peran |
|---|---|
| `TopProgressBar.tsx` | Bar 2px gradient biru di tepi atas viewport. `scaleX: 0 → 0.4 → 0.75` (500ms), lalu `1` saat fade out (220ms). `pointer-events-none`, `z-[80]`. |
| `PageTransition.tsx` | `AnimatePresence mode="wait"`. Wrapper halaman `key={displayRail}`. Enter: `opacity 0→1, y: 12→0, filter: blur(6px)→0` (220ms `easeOut`). Exit: `opacity 1→0, y: -8, blur 6px` (220ms). Respect `useReducedMotion`. |
| `PageSkeleton.tsx` | Ganti 4 fallback `animate-pulse` duplikat. Satu komponen, 4 variant (`files|tasks|courses|settings`). Shimmer + stagger 50ms via `motion.div variants`. `aria-busy` + `sr-only` label. |
| `FixedLayer.tsx` | `createPortal(children, document.body)` + `useSyncExternalStore` mounted-guard. Dipakai untuk **semua** `position: fixed` di dalam halaman (sidebar + backdrop + toast + FAB) agar tetap menempel ke viewport meski wrapper animasi pakai `filter/blur`. |
| `usePageTransition.ts` | Hook logika transisi: `navigate()` dipanggil dari event klik (bukan effect), set `pending=true`, jeda 140ms swap `displayRail`, progress bar hide 560ms total (`useLayoutEffect` di AppLayout menulis `--sbw` ke `:root`). |

### Integrasi AppLayout (`src/layouts/AppLayout.tsx`)
- `--sbw` ditulis ke `document.documentElement.style` via `useLayoutEffect` (bukan inline style) → `Composer` ikut mewarisi lebar sidebar asli saat di-drag resize.
- `TopProgressBar` di-render di paling atas (root div, luar `PageTransition`).
- `IconRail.onSelect = navigateTo` (bukan `setActiveRail` langsung).
- Semua branch halaman dibungkus `<PageTransition pageKey={displayRail}>`.
- Fallback `Suspense` diganti `<PageSkeleton variant="..." />`.
- **Halaman jangan meredam layar sendiri saat load.** `PageSkeleton` (fallback Suspense) + skeleton di area konten = satu proses loading yang nyambung. Overlay spinner/overlay error di dalam halaman apa pun akan membaca sebagai transisi kedua dan menutupi shimmer — Tasks dan Courses sudah dibersihkan, jangan dikembalikan.
- `PageSkeleton` sudah membawa container + padding sendiri. Kalau ditaruh di dalam container yang sudah berpadding (semua halaman), teruskan `className="px-0 py-0 sm:px-0"` — `sm:px-0` wajib karena `twMerge` hanya menimpa modifier yang sama.
- **Request pertama sebuah hook tidak boleh ikut debounce.** `DEBOUNCE_MS` (220ms) itu untuk menahan ketikan di search/filter; memakainya juga saat load awal menambah 220ms layar kosong sebelum data pertama tampil. Di `useTasks` penandanya `awaitingFirstResponse` (`useRef`), diturunkan ke `false` di dalam `finally` — bukan di awal effect, supaya `StrictMode` (mount → effect#1 → cleanup → effect#2) tetap membaca `true` dan tidak kembalikan delay itu di dev. Jangan pakai `hasLoaded` di dependency: nilainya berubah setiap load sehingga effect menarik data dua kali.

## Timing (Total ~580ms)

| Tahap | Durasi | Detail |
|---|---|---|
| Klik → bar muncul | <50ms | `pending=true` sync |
| Swap `displayRail` | 140ms | `SWAP_DELAY_MS` — beri waktu bar muncul dulu, hindari flicker saat chunk cached |
| Exit halaman lama | 220ms | `opacity↓, y:-8, blur↑` |
| Enter halaman baru | 220ms | `opacity↑, y:12→0, blur↓` |
| Bar fade out | 220ms | Mulai setelah swap, total `BAR_DURATION_MS=560ms` |

## CSS Shimmer (`src/index.css`)
```css
@utility skeleton-shimmer {
  background: linear-gradient(100deg, var(--color-surface-card) 30%, var(--color-surface-container-high) 50%, var(--color-surface-card) 70%);
  background-size: 800px 100%;
  animation: shimmer 1.6s linear infinite;
}
@keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
@media (prefers-reduced-motion: reduce) { .skeleton-shimmer { animation: none; } }
```
Pakai token Orbita (`--color-surface-card`, `--color-surface-container-high`) — otomatis beradaptasi light/dark.

## FixedLayer — Mengapa Diperlukan
`PageTransition` pakai `filter: blur()`. Per spesifikasi CSS, `filter != none` membuat containing block untuk `position: fixed`. Akibatnya sidebar `fixed left-[var(--rail-w)]` bergeser ganda (sudah di-offset wrapper `pl-[rail-w+sbw]`) dan menimpa konten.

Solusi: **Portal ke `body`**. `FixedLayer` (`src/components/feedback/FixedLayer.tsx`) menggunakan `createPortal` + mounted-guard via `useSyncExternalStore` (tanpa `setState` di effect, lolos lint React Compiler).

Dibungkus: `TasksSidebar`, `CoursesSidebar`, `SettingsSidebar`, `DocumentsSidebar`, backdrop masing-masing, 4× toast, FAB HomePage. Dialog Radix sudah pakai portal sendiri — tidak perlu (`TaskCreateDialog` pun begitu).

## Aturan Struktur Sidebar (5 sidebar)

Semuanya **page-owned** (dirender di dalam halaman, bukan di shell `AppLayout`), kecuali `ChatSidebar` untuk rail `chat-workspace`/`analytics`. `AppLayout` hanya merender sidebar shell itu — jangan pernah merender sidebar milik halaman, itu yang dulu menyebabkan sidebar menumpuk.

Struktur wajib (`DocumentsSidebar`/`ChatSidebar` = acuan, `TasksSidebar`/`CoursesSidebar`/`SettingsSidebar` sudah disamakan):

```
<SidebarTransition open width dragging onClose className="fixed … flex h-full flex-col …">  ← tanpa overflow, tanpa padding
  <aside className="flex h-full w-[var(--sbw-actual,280px)] flex-col">   ← lebar eksplisit, handle jadi child langsung
    <div className="flex flex-col gap-4 p-4">                     ← header + search + CTA (pinned)
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-3">  ← SATU-SATUNYA scroll container
    <div className="p-3">                                         ← kartu footer
    <div role="separator" className="absolute right-0 w-3 …" />   ← handle resize, sibling scroll area
  </aside>
</SidebarTransition>
```

**Kenapa handle sekarang `right-0 w-3` (bukan lagi `-right-1`):** `SidebarTransition` memaksa `overflow-hidden` di wrapper (wajib, karena `width`-nya dianimasikan — tanpa clip konten meluber keluar sidebar yang sedang menyempit). Handle yang ada di `right: -4px` akan ter-clip jadi ~4px dan praktis tidak bisa di-drag. Jadi handle dipindah ke `right-0 w-3`: 12px, **seutuhnya di dalam** panel, masih di atas padding sidebar (`p-3`/`px-3`) jadi tidak menimpa konten. Tombol hide `ChatSidebar` juga digeser: `-right-3` → `right-2`.

**Kenapa `overflow` tetap harus di block tengah:** outer `overflow-hidden` hanya memotong sumbu yang memang tidak boleh keluar (konten sidebar). Area yang boleh di-scroll tetap harus `overflow-y-auto` di block tengah — kalau digeser ke outer, `overflow-x` *computed* ikut jadi ter-clip.

**Kenapa tidak boleh `p-4` dobel:** padding ada di outer **dan** inner = 32px horizontal, spenduh di sidebar 280px. Padding hanya di block anak (`p-4` / `px-3 pb-3` / `p-3`).

## Animasi Transisi Sidebar (Accordion)

Pola **accordion**, bukan slide: `width` panel dianimasikan `0 ↔ lebar efektif`.

| Elemen | Nilai |
|---|---|
| `SIDEBAR_MOTION` | `{ duration: 0.22, ease: 'easeOut' }` — `src/components/feedback/sidebarMotion.ts` |
| Panel | `initial={{width:0}} animate={{width}} exit={{width:0}}` |
| Backdrop | `opacity 0↔1`, durasi sama |
| `--sbw` | tween `0 ↔ lebar` dengan `SIDEBAR_MOTION` yang **sama** |

- **Isi sidebar tidak boleh ikut ter-squish.** `<aside>` punya lebar eksplisit sendiri (`w-[var(--sbw-actual,280px)]`), jadi saat panel menyempit yang terlihat efeknya konten ter-*reveal* dari kiri — bukan label yang ikut ter-squish tiap frame.
- **`--sbw-actual` ditulis di wrapper, dibaca di `<aside>`.** Arah parent → child. Deklarasikan di child lalu baca dari parent selalu jatuh ke fallback (custom property hanya mewarisi ke bawah) — itu bug yang membuat drag-resize tidak pernah bekerja sebelumnya.
- **Geser `-right-1` forbidden** — handle wajib di dalam panel, lihat aturan struktur di atas.
- `AnimatePresence initial={false}` → sidebar **tidak** animasi saat mount / pindah rail (itu urusan `PageTransition`).
- `dragging` → `duration: 0` untuk perubahan `width`, supaya handle tidak rubber-band. Perubahan `width` di luar drag (nudge keyboard, double-click reset) ikut tween 220ms.
- **Di bawah `md`, lebar dikunci ke `SIDEBAR_MOBILE_WIDTH` (280px)** supaya drawer tidak melebihi layar HP.
- Backdrop drawer **ikut di-render `SidebarTransition`** (props `onClose`), bukan lagi 5 `<button>` duplikat di tiap sidebar.
- `prefers-reduced-motion` → tanpa motion sama sekali, `width` langsung diset.

## Lebar Sidebar

- `useSidebarWidth.ts`: `SIDEBAR_MIN_WIDTH = 200`, `MAX = 420`, `DEFAULT = 280`. Dipakai bersama 5 sidebar — satu state `width`, satu key `localStorage: orbita:sidebar-width`, jadi menyempitkan di satu sidebar memengaruhi semua.
- Semua label yang bisa melebihi lebar sidebar wajib `truncate` + parent `min-w-0`; badge/counter wajib `shrink-0`. Kalau lupa, konten meluber keluar card di 200px.
- Tekan yang sudah aman: `ChatListItem` (truncate + min-w-0 + shrink-0). Yang wajib dijaga: judul sidebar, label quick view, nama alokasi, teks tombol CTA, `UpgradeCard`.


## Sticky Topbars
`TasksTopbar` / `CoursesTopbar` / `SettingsTopbar` (`sticky top-0`) **tidak** dibungkus — `filter` tidak membuat scroll container, `sticky` tetap menempel ke viewport dengan benar. Hanya `fixed` yang bermasalah.

## CSS Variable `--sbw`

Ditulis ke `:root` oleh `src/hooks/useSidebarOffset.ts` (**bukan** lagi `useLayoutEffect` di `AppLayout`), memakai `MotionValue` + `animate()`:
- `open` berubah → tween `0 ↔ lebar` selama `SIDEBAR_MOTION`.
- `width` berubah (drag / nudge / reset) → `jump` instan.
- Nilai yang ditulis sudah ikut dikunci ke `SIDEBAR_MOBILE_WIDTH` di bawah `md`, sama persis dengan panel.

**Tidak boleh ada `transition-[left]` di konsumen `--sbw`.** `Composer` dan bar input tasks yang dulu ada pernah punya `transition-[left] duration-300` sementara `--sbw` di-set instan — hasilnya keduanya meleset ~300ms dan tidak sinkron dengan konten. Sekarang `--sbw`-nya yang dianimasikan, jadi konsumen cukup membacanya polos.

**Tidak boleh ada inline `--sbw` di elemen mana pun.** `Composer` pernah menulis `--sbw` sendiri di root-nya, yang **menimpa** nilai `:root` dan membuat `--sbw` lokal ikut meleset. Sidebar pun tidak boleh mendeklarasikan `--sbw-actual` sendiri — itu milik `SidebarTransition`.

## Verifikasi Visual Checklist
- [ ] `npm run dev` → Tasks / Courses / Settings: sidebar duduk pas di kanan icon rail, **tidak menutupi konten**.
- [ ] **Toggle sidebar: panel accordion 0↔lebar, dan konten + composer geser bareng tanpa lag** (tidak ada yang tertinggal ~300ms).
- [ ] **Drag-resize benar-benar mengubah lebar sidebar** (sebelumnya tidak bekerja sama sekali) dan tidak rubber-band.
- [ ] Handle resize di `right-0 w-3` — **mudah diklik** sepanjang tinggi sidebar, tidak ter-clip.
- [ ] Tombol hide sidebar di `ChatSidebar` (`right-2`) terlihat utuh, tidak ter-clip.
- [ ] Spam toggle buka/tutup → tidak ada sidebar ganda/tertinggal, animasi tetap halus.
- [ ] Ganti rail saat sidebar terbuka → sidebar tidak beranimasi sendiri (itu `./PageTransition`).
- [ ] Toast muncul **di tengah** layar (bukan bergeser ke kanan).
- [ ] Pindah halaman cepat-cepat → tidak ada sidebar ganda/tertinggal.
- [ ] `prefers-reduced-motion: reduce` (DevTools Rendering) → animasi mati, konten muncul instan, sidebar tetap benar.
- [ ] Mobile 360px: padding `pl-[var(--rail-w)]` tidak rusak, drawer sidebar overlay kerja, dan lebarnya terkunci 280px walau di desktop pernah di-set 420px.
- [ ] Geser window melewati `md` → lebar sidebar & padding konten tetap sinkron.
- [ ] Build bersih: `tsc -b`, `oxlint`, `vite build` sukses.

## Referensi Kode
- `src/components/feedback/` — 4 file komponen + hook + `sidebarMotion.ts` (konstanta `SIDEBAR_MOTION`)
- `src/hooks/usePageTransition.ts`, `src/hooks/useSidebarOffset.ts`, `src/hooks/useMediaQuery.ts`
- `src/layouts/AppLayout.tsx` (baris ~112–119, ~176, ~220–225, ~330+)
- `src/pages/TasksPage.tsx`, `CoursesPage.tsx`, `SettingsPage.tsx`, `FilesPage.tsx`, `HomePage.tsx` — `import { FixedLayer }` + wrap
- `src/index.css` — `@utility skeleton-shimmer`, `@keyframes shimmer`

## Utang Technical yang Diketahui

- Dialog (`src/components/ui/dialog.tsx`) sengaja centered (`left-1/2 -translate-x-1/2`) dan TIDAK offset `--sbw` — modal di atas overlay gelap tidak perlu mengikuti lebar sidebar. Jangan menuliskan nama class arbitrary-value-nya di file `.md`: Tailwind v4 memindai markdown di root dan akan meng-generate aturan CSS dari teks di dokumen, termasuk class yang sudah tidak dipakai.
