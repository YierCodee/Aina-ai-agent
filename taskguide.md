# Task Guide — `src/pages/TasksPage.tsx`

Halaman utama untuk menampilkan, memfilter, dan mengelola daftar task.
State dikelola sepenuhnya lokal di komponen ini (belum ada server/persistence).

---

## Props (tipe `Props`)

| Prop | Fungsi |
|---|---|
| `sidebarOpen` | Status sidebar terbuka/tertutup |
| `sidebarWidth` | Lebar sidebar (hasil drag resize) |
| `sidebarDragging` | Apakah sidebar sedang di-drag |
| `onResizeStart` | Mulai drag resize sidebar |
| `onResizeNudge` | Resize via keyboard (panah), `delta` = perubahan lebar |
| `onResizeReset` | Kembalikan lebar sidebar ke default |
| `onToggleSidebar` | Buka/tutup sidebar |
| `onCloseSidebar` | Tutup sidebar |
| `onRunAgent` | Callback menjalankan agent AI untuk sebuah task |

---

## State lokal

| State | Tipe | Fungsi |
|---|---|---|
| `tasks` | `TaskItem[]` | Sumber data task (init dari `INITIAL_TASKS`) |
| `query` | `string` | Kata kunci pencarian di filter bar |
| `sidebarQuery` | `string` | Kata kunci pencarian di sidebar |
| `priority` | `PriorityFilter` | Filter prioritas (`all`/`urgent`/`high`/…) |
| `ownerTab` | `OwnerTab` | Filter pemilik (`all`/`personal`/`ai`) |
| `activeQuick` | `QuickViewId \| null` | Quick view yang aktif di sidebar |
| `sort` | `TasksSort` | Urutan sortir (`due`/`priority`/`name`) |
| `toast` | `string \| null` | Pesan notifikasi toast |
| `toastTimer` | `ref` | Timer untuk auto-dismiss toast |
| `idRef` | `ref` | Counter untuk menghasilkan ID task baru |

---

## Fungsi-fungsi

### `flash(msg)`
Menampilkan toast notifikasi. Timer sebelumnya dibersihkan dulu agar toast
baru tidak langsung hilang, lalu toast otomatis menghilang setelah **2600ms**.

### `filtered` (useMemo)
Memoisasi hasil filter + sort:
1. Filter berdasarkan `ownerTab` (via `ownerMatches`)
2. Filter `priority` (kecuali `all`)
3. Filter kata kunci `query` (judul + tag + nama assignee)
4. Filter kata kunci `sidebarQuery` (kriteria sama)
5. Sort hasil akhir via `compareTask(a, b, sort)`

### `counts` (useMemo)
Menghitung jumlah task untuk quick view di sidebar:
- `my` — task owner `personal`
- `ai` — task owner `ai` atau `system`
- `priority` — prioritas `urgent`/`high`
- `due` — task yang masuk group `today`

### `today` / `upcoming` (useMemo)
Memecah `filtered` menjadi dua kelompok berdasarkan `t.group`:
- `today` → "Today's Priorities"
- `upcoming` → "Upcoming & In Progress"

### `cycleSort()`
Meng-cycle urutan sortir: `due` → `priority` → `name` → `due`.

### `resetLocalFilters()`
Meretet semua filter ke default (query kosong, priority `all`, sort `due`,
owner `all`, quick view `null`).

### `handleOwnerChange(tab)`
Mengganti filter owner dan menyinkronkan quick view sidebar:
- `ai` → quick view `ai`
- `personal` → quick view `my`
- selain itu → quick view `null`

### `handleSelectQuick(id)`
Menang klik quick view di sidebar, dengan sinkronisasi dua arah:
- `my` → ownerTab `personal`
- `ai` → ownerTab `ai`
- `priority` / `due` → ownerTab `all` (bukan filter owner)

### `toggleTask(id)`
Mengubah status `completed` task tertentu (mutasi imut via `map`).

### `deleteTask(id)`
Menghapus task berdasarkan `id`, lalu menampilkan toast "Task deleted."

### `bulkComplete()`
Menandai semua task **yang terlihat** (hasil `filtered` dan belum selesai)
sebagai selesai. Jika tidak ada yang terbuka, tampilkan toast info.

### `addTask(input)`
Menambahkan task baru dari `QuickTaskInput`:
1. Increment `idRef` untuk ID unik (`t-custom-XXX`)
2. Tentukan `personal` dari `input.delegate.name === 'You'`
3. Bangun objek `TaskItem` (owner, assignee, action, group `today`, dll.)
4. Sisipkan ke posisi paling atas daftar
5. Reset filter lokal + toast konfirmasi

`action` otomatis: `comment` (personal) atau `run` (AI).

### `handleAction(task)`
Aksi pada tombol di kartu task:
- `kind === 'run'` → delegasikan ke `onRunAgent(task)` (jalankan agent)
- selain itu → tampilkan toast label aksi

### `focusSearch()` / `focusQuickInput()`
Fokus ke input lewat `document.getElementById`:
- `task-search` → input pencarian
- `task-quick-input` → input quick-add task

---

## Struktur render

1. **`FixedLayer` + `TasksSidebar`** — sidebar (query, quick view, resize)
2. **`TasksTopbar`** — topbar (add task, toggle sidebar, filter, sort)
3. **`TasksMetrics`** — kartu metrik ringkasan
4. **`TasksFilterBar`** — pencarian, filter prioritas, tab owner, sort, bulk complete
5. **Dua `TaskGroup`** — "Today's Priorities" dan "Upcoming & In Progress",
   masing-masing memetakan `TaskCard` (toggle / action / delete) + empty state
6. **`CopilotBanner`** — banner AI (optimize & settings → toast)
7. **`FixedLayer` + `TaskQuickInput`** — input tambah task (floating)
8. **Toast** — notifikasi `role="status"` di bagian bawah

---

## Catatan

- Belum ada persistensi — refresh akan mengembalikan `INITIAL_TASKS`.
- Dua input pencarian (`query` & `sidebarQuery`) memakai kriteria sama dan
  di-AND-kan.
- Area konten punya `pb-56` agar tidak tertutup quick input & toast yang
  di-`FixedLayer`.
