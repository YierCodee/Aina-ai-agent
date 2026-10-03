# Integrasi Agent Asisten Kuliah

Dokumen ini merangkum seluruh pekerjaan pada sesi ini: sistem prompt dan agent
Google ADK di backend, lalu penyambungan fitur chat di frontend.

Status: **backend selesai dan teruji. Frontend selesai dan teruji secara statis
dan HTTP, tetapi belum pernah dilihat di browser sungguhan** (lihat
[Batasan Verifikasi](#batasan-verifikasi)).

---

## Daftar Isi

- [Ringkasan](#ringkasan)
- [Stack dan Versi](#stack-dan-versi)
- [Bagian 1 — Backend](#bagian-1--backend)
  - [Struktur Prompt](#struktur-prompt)
  - [Anatomi Agent](#anatomi-agent)
  - [Endpoint HTTP](#endpoint-http)
- [Bagian 2 — Frontend](#bagian-2--frontend)
  - [Alur Data](#alur-data)
  - [Komponen](#komponen)
  - [Dua State Visual](#dua-state-visual)
- [Temuan Penting](#temuan-penting)
- [Verifikasi](#verifikasi)
- [Belum Dikerjakan](#belum-dikerjakan)
- [Cara Menjalankan](#cara-menjalankan)
- [Rujukan API](#rujukan-api)

---

## Ringkasan

Tiga tahap pekerjaan:

| Tahap | Hasil |
|---|---|
| 1. Sistem prompt | `backend/agent/prompt.py` — 6 seksi prompt, 4.321 karakter |
| 2. Agent ADK | `LlmAgent` + `App` + `Runner`, satu tool `web_search`, endpoint `POST /api/chat` |
| 3. Integrasi chat | Daftar pesan, markdown, loading, error, retry, stop, di sisi frontend |

Jawaban singkat atas pertanyaan awal — apakah integrasi dengan frontend
sudah memungkinkan: **backend-nya sudah siap sejak awal**, tapi fitur chat di
frontend masih kerangka mock tanpa ada UI pesan sama sekali. Bagian 3
mengbuild UI itu.

---

## Stack dan Versi

### Python

```
python           3.14.6      (venv: .venv/)
google-adk       2.10.0      (baru)
google-genai     2.25.0      (sudah ada sebelumnya)
fastapi          >=0.133     (naik dari 0.110)
starlette        >=1.3.1     (naik, ikut fastapi)
uvicorn          >=0.34
pydantic         >=2.12
requests         >=2.32.4
```

### Node

```
react-markdown   ^10.1.0     (baru, peer: react>=18)
remark-gfm       ^4.0.1      (baru)
react            19.2.8      (sudah ada)
vite             8.3.1
typescript       ~6.0.2
```

---

## Bagian 1 — Backend

### Struktur Prompt

`backend/agent/prompt.py` — semua teks prompt ada di satu file, tidak
tersebar di modul lain. Mengubah perilaku agent cukup mengubah isi seksi
di sini.

Urutan seksi disengaja: identitas → kemampuan → cara memakai tool → cara
memperlakukan data dari luar → batasan → gaya bahasa. Aturan tool dan
aturan data dari luar berdampingan karena keduanya mengatur sisi masukan,
dan batasan diletakkan sebelum gaya agar aturan format tidak menutupi
aturan perilaku.

| Konstanta | Isi |
|---|---|
| `APP_NAME` | `"asisten_kuliah"` — slug, bukan `settings.app_name` |
| `AGENT_NAME` | `"asisten_kuliah"` |
| `IDENTITY` | Partner belajar, bukan Petugas Akademik |
| `CAPABILITIES` | Jelaskan konsep, pecah soal, ringkas, terjemahkan, cari info |
| `TOOL_USAGE` | Kapan wajib `web_search`, aturan sitasi, larangan mengarang URL |
| `UNTRUSTED_CONTENT` | Isi hasil `web_search` diperlakukan sebagai data pihak ketiga, bukan instruksi |
| `BOUNDARIES` | Jangan mengerjakan tugas, jangan mengarang sitasi, arahkan ke bagian akademik |
| `STYLE` | Bahasa mahasiswa, ringkas, struktur, tanpa basa-basi |

Fungsi exported:

```python
build_instruction(profil: Optional[dict] = None) -> str
```

`profil` hanya menerima kunci `nama`, `prodi`, `semester`, `fokus`, dan hanya
nilai `str`/`int`/`float`. Gunanya sebagai pagar: data tak terduga dari lapisan
HTTP tidak bisa menyuntik apa pun ke system prompt.

- Tanpa profil: **4.321 karakter**
- Dengan profil: **4.472 karakter** untuk profil contoh 4 field —_block_
  `KONTEKS MAHASISWA` bertambah sebesar isinya, jadi angka ini bergantung
  pada profil yang dikirim.

### Anatomi Agent

```
backend/agent/prompt.py     teks prompt
        ↓
backend/agent/agent.py      LlmAgent + App + Runner (singleton lazy)
        ↓
backend/agent/execute.py    run_turn() — adapter async generator → dict
        ↓
backend/routers/chat.py     POST /api/chat
```

**`agent.py`** — `get_runner()` mengembalikan `Runner` atau `None`. Mengembalikan
`None` (bukan melempar) adalah keputusan sadar: `/health` harus tetap menjawab
dan `/api/chat` harus balas 503 dengan pesan ramah, bukan 500, ketika key kosong.

`Gemini(client=...)` dipakai untuk menyuntikkan client dari
`models/gemini.py`. ADK memvalidasi field ini sebagai `genai.Client` asli
(ketika diuji dengan `object()` dummy, pydantic menolaknya) — jadi pipeline
key yang sudah ada tetap berlaku di dalam ADK.

Runner memakai `auto_create_session=True`. Tanpa itu, percakapan pertama
dengan `session_id` baru melempar `SessionNotFoundError`.

**`execute.py`** — `run_turn()` unstoppable iterator dari
`runner.run_async()`. Tanggung jawabnya: kirim pesan, kumpulkan jawaban, dan
ubah kegagalan jadi exception domain.

Tiga exception, dipetakan ke status HTTP berbeda:

| Exception | Arti | HTTP |
|---|---|---|
| `AgentUnavailableError` | Key / `google-adk` belum siap | 503 |
| `AgentTimeoutError` | Lewat `agent_turn_timeout` | 504 |
| `AgentRunError` | Error dari model, atau balasan kosong | 502 |

Ekstraksi teks hanya dari event dengan `is_final_response()` — event
pemanggilan tool dan potongan antar-putusan tidak ikut terambil.

**Session** — `InMemorySessionService`, jadi riwayat hidup di memori proses.
 Hilang saat backend dimatikan. Ini pilihan sementara yang disepakati.

### Endpoint HTTP

`POST /api/chat`

Request:
```json
{ "message": "jelaskan turunan", "session_id": "default", "user_id": "mahasiswa" }
```

Respons sukses:
```json
{ "reply": "...", "session_id": "default", "tools_used": ["web_search"], "model": "gemini-2.0-flash" }
```

Validasi: `message` 1–8000 karakter, `session_id` ≤128, `user_id` ≤128.
Pesan kosong menghasilkan 422.

`GET /health` sekarang melaporkan `agent_ready` di samping `gemini_configured`,
plus `warning` yang spesifik apakah masalahnya key Gemini atau key Tavily.

### Konfigurasi Baru

`backend/core/config.py` — semua opsional, ada defaultnya:

| Setting | Default | Arti |
|---|---|---|
| `adk_app_name` | `asisten_kuliah` | Nama app untuk ADK, bukan `app_name` |
| `agent_max_llm_calls` | `8` | Batas panggilan LLM per turn |
| `agent_temperature` | `0.3` | Suhu model |
| `agent_turn_timeout` | `120` | Batas durasi satu turn (detik) |
| `tavily_max_results` | `5` | Jumlah hasil per pencarian |

### Perubahan Tool

`WEB_SEARCH_TOOL.py` sebelumnya mengembalikan `json.dumps(...)`. Sekarang
mengembalikan `dict`.

Alasannya teknis: ADK membungkus nilai kembalian bertipe `string` menjadi
`{"result": "<json>"}` yang boros token, sedangkan `dict` diteruskan apa adanya
ke model. Pada respons kosong, ini menghemat ratusan token per panggilan.

`print()` juga diganti ke `logger` agar konsisten dengan `models/gemini.py`.

Docstring tetap gaya Google (`Args:`) — diverifikasi bahwa ADK membacanya
menjadi `description` function declaration.

---

## Bagian 2 — Frontend

### Alur Data

```
Composer  →  send(text)  →  useChat
                               ↓  POST /api/chat
                            chatApi.sendChatMessage
                               ↓
                          useChat: pesan user + placeholder 'pending'
                               ↓
        MessageList  ←  HomePage  ←  AppLayout
```

`sessionId` disimpan di `useRef` dan **tidak** dikembalikan sebagai bagian dari
hasil hook. Alasannya ada dua: tidak ada konsumen yang membutuhkannya, dan
membaca `ref.current` saat render membuat nilainya bisa basi terhadap tampilan
yang sedang digambar (oxlint menandainya sebagai `react(refs)`).

### Komponen

| File | Tanggung jawab |
|---|---|
| `src/lib/sidecar.ts` | `SIDECAR_BASE_URL` — satu sumber untuk `tauri.ts` dan `chatApi.ts` |
| `src/lib/chatApi.ts` | Klien POST, mapping status HTTP → pesan berbahasa manusia |
| `src/hooks/useChat.ts` | State percakapan, `AbortController`, `send`/`stop`/`retry`/`reset` |
| `src/hooks/useComposerHeight.ts` | Publish `--composer-h` ke `:root` via `ResizeObserver` |
| `src/components/chat/MarkdownAnswer.tsx` | `react-markdown` + `remark-gfm` dengan override komponen |
| `src/components/chat/MessageList.tsx` | Bubble, typing dots, error + retry, auto-scroll |

**`chatApi.ts`** membedakan dua jenis kegagalan:

- `status` berupa angka → ada yang salah dengan pesan atau backend
- `status` `null` → request tidak pernah sampai ke sidecar (backend mati)

`readErrorDetail()` hanya mengambil `detail` kalau bertipe `string`. Bentuk
error validasi FastAPI punya `detail` berupa array objek, dan itu tidak boleh
pernah ditampilkan mentah ke pengguna.

**`useChat.ts`** — `retry()` membuang pesan assistant yang gagal sebelum
mengirim ulang pesan user terakhir, jadi tidak pernah ada dua balasan untuk
satu pertanyaan.

**`MessageList.tsx`** — auto-scroll punya guard: hanya jalan kalau user berada
dalam jarak 120px dari dasar. Memaksa scroll saat mereka sedang membaca pesan
yang panjang sangat mengganggu.

### Dua State Visual

`HomePage` beralih berdasarkan `messages.length`:

| Kondisi | Tampil |
|---|---|
| `messages.length === 0` | Landing: greeting, kartu, quick actions |
| `messages.length > 0` | Daftar pesan, menggulir sendiri |

Sebelum ini, `HomePage` mendeklarasikan prop `messages` tapi tidak pernah
memakainya — itu sebabnya kirim pesan tidak pernah mengubah apa pun di layar.

### Lazy Loading Markdown

`MarkdownAnswer` di-`lazy()`-load di dalam `MessageList`, jadi ekosistem
markdown (react-markdown + remark-gfm + unified + micromark, ±1.2 MB di
`node_modules`) tidak masuk ke bundle awal.

Dampak terukur:

| | Sebelum | Sesudah |
|---|---|---|
| Bundle utama | 735 kB (gzip 232 kB) | **541 kB** (gzip 173 kB) |
| Chunk terpisah | — | `MarkdownAnswer` 157 kB (gzip 47 kB) |

Diverifikasi bahwa string `micromark`, `mdast`, `hast` nol di bundle utama dan
hanya ada di chunk markdown.

---

## Temuan Penting

Empat hal yang tidak terduga dan mengubah keputusan teknis.

### 1. `settings.app_name` ditolak ADK

`App()` memvalidasi `name` dengan regex `^[a-zA-Z][a-zA-Z0-9_-]*$` dan menolak
nilai `"user"`. `settings.app_name` = `"Agent FastAPI Sidecar"` mengandung spasi,
jadi **akan membuat server gagal start**.

Diuji langsung:
```
ValueError: Invalid app name 'Agent FastAPI Sidecar': must start with a
letter and can only consist of letters, digits, underscores, and hyphens.
```

Karena itu `APP_NAME` dipisah di `prompt.py` dan tidak memakai `settings.app_name`.

### 2. CORS memblokir port fallback Vite

Saat pengujian, Vite berjalan di port 5174 karena 5173 sudah dipakai proses
lain. Respons terhadap origin 5174 **tidak punya** header
`access-control-allow-origin`, sehingga browser memblokir respons chat.

IniYMUtooth dan tidak terlihat dari kode — gejalanya "chat tidak merespons
tanpa pesan error".

Diperbaiki dengan `allow_origin_regex`. Matriks hasil pengujian:

| Origin | Hasil |
|---|---|
| `http://localhost:5173` | diizinkan |
| `http://localhost:5174` | diizinkan |
| `http://127.0.0.1:9999` | diizinkan |
| `tauri://localhost` | diizinkan |
| `https://tauri.localhost` | diizinkan |
| `https://evil.example.com` | **diblokir** |

### 3. ADK tidak memotong blok `Args:`

Docstring gaya Google tidak diparse terpisah — seluruh docstring, termasuk
blok `Args:` dan `Returns:`, menjadi `description` yang dikirim ke model.
Parameter diambil dari type hint, bukan dari `Args:`.

Tidak merugikan: model tetap perlu tahu isi kunci `results` (`title`, `url`,
`content`), dan informasi itu ada di blok `Returns:`.

### 4. `pb-36` statis tidak bisa mengimbangi Composer dinamis

Composer memakai `position: fixed` dengan textarea yang tumbuh antara 52px dan
180px. Padding bawah tetap akan menyisakan ruang kosong saat Composer pendek, atau
menutupi pesan terakhir saat Composer panjang.

Solusi: `useComposerHeight` mempublikasikan tinggi sebenarnya sebagai CSS
variable `--composer-h` di `:root`, dipakai lewat
`pb-[var(--composer-h,206px)]`. `ResizeObserver` yang memperbaruinya, dengan
nilai awal 206px agar render pertama tidak melompat.

---

## Verifikasi

### Yang lolos

**Backend** — 20 pemeriksaan otomatis, semuanya lulus:

- Semua simbol ADK yang dipakai tersedia
- `get_runner()` mengembalikan `None` dengan rapi tanpa exception
- Signature `Runner` / `Gemini` / `RunConfig` cocok dengan source `v2.10.0`
- `App()` menerima `APP_NAME`, dan **menolak** `settings.app_name`
- Client tersuntik ke `google.genai.Client` dan benar-benar dipakai model
- `/health` → 200 dengan `agent_ready: false`
- `/api/chat` → 503 dengan pesan ramah, bukan 500
- `message` kosong → 422
- `web_search` mengembalikan `dict` dengan error terstruktur
- 8 uji logika `execute.py` dengan event ADK tiruan: teks normal, beberapa
  event digabung, tool terdeteksi, event non-final diabaikan, `error_code`
  jadi `AgentRunError`, balasan kosong jadi `AgentRunError`, runner `None`
  jadi `AgentUnavailableError`, `RunConfig` diteruskan benar
- Function declaration tool valid: nama `web_search`, param `query` wajib string

**Frontend**

- `tsc -b --noEmit` bersih
- `oxlint` 0 warning, 0 error di 9 file baru
- `npm run build` sukses
- 8 modul baru tersaji HTTP 200 lewat dev server tanpa error transform

**Server nyata**

- Start bersih, log tanpa error
- Route terdaftar: `/`, `/health`, `/api/chat`
- CORS matrix benar (lihat di atas)

**Kebersihan**

- `compileall` bersih untuk seluruh `backend/`
- Sapu karakter non-ASCII dan token nyasar di 20 file: bersih

### Batasan Verifikasi

**Tidak ada browser di lingkungan kerja ini, jadi rendering visual belum pernah
dipihat.** Yang terverifikasi hanya modul ter-resolve, TypeScript/lint/build
bersih, dan HTTP end-to-end.

Tiga hal yang wajib Anda periksa sendiri di layar:

1. Jarak pesan terakhir terhadap Composer saat textarea digeser panjang — ini
   yang dioriginasi dengan `--composer-h`, tapi angka jatuhnya hanya bisa
   dinilai di layar
2. Auto-scroll benar-benar berhenti saat Anda menggulir ke atas
3. Kapan `MarkdownAnswer` selesai di-lazy-load, dan apakah ada kedipan

---

## Belum Dikerjakan

### Sidecar tidak pernah dijalankan (paling penting)

`src-tauri/src/lib.rs` mendaftarkan `tauri_plugin_shell` tetapi `.setup()` tidak
melakukan spawn apa pun. `src-tauri/binaries/fastapi-server-x86_64-unknown-linux-gnu`
hanya stub bash **228 byte** yang mencetak pesan.

Dampaknya: di aplikasi `.app` yang sudah dibundel, **tidak ada FastAPI sama
 sekali**. `externalBin` di `tauri.conf.json` sudah dideklarasikan tapi tidak
dipakai. Untuk memakai chat, backend harus dijalankan manual.

Ini di luar cakupan yang disepakati — PR terpisah.

### Sesi tidak persisten

`InMemorySessionService` di backend. Disepakati untuk sementara; rencana
sel berikutnya adalah penyimpanan lokal.

### `loadThread()` dijumbo

Mengklik thread di `ChatSidebar` sekarang hanya menandai thread aktif dan
mengosongkan area chat. Sebelumnya ia menampilkan pasangan pesan rekaan yang
terlihat meyakinkan. Digestinya: pesan palsu lebih berbahaya daripada pesan
kosong yang jujur, dan menggantinya hanya butuh menghapus enam baris.

Label-label di sidebar masih data contoh (`src/data/chats.ts`) dan tidak
terhubung ke session mana pun.

### `.env` tidak terbaca di dalam bundle PyInstaller

`core/config.py` me-resolve `backend/.env` lewat `Path(__file__)`. Di dalam
bundle PyInstaller onefile, `__file__` mengarah ke `_MEIPASS`, sehingga file
itu tidak ditemukan. Berarti key harus lewat environment variable dari Tauri.

Pre-existing, tapi akan menggigit saat rilis.

### PyInstaller + Python 3.14

`build_sidecar.sh` sudah ditambah `--collect-all google_adk` dan
`--collect-all google.genai` karena ADK memakai dynamic import. Namun
PyInstaller di Python 3.14 belum diverifikasi di sini.

### SSE streaming

Masih JSON satu round-trip. `sendChatMessage` sudah menerima `AbortSignal`,
sehingga menambah streaming nanti tidak mengubah antarmuka hook.

---

## Cara Menjalankan

```bash
# 1. Isi key di backend/.env (keduanya masih placeholder)
#    GEMINI_API_KEY  -> https://aistudio.google.com/app/apikey
#    TAVILY_API_KEY  -> https://app.tavily.com

# 2. Migrasi skema (WAJIB, sekali per mesin / setiap upgrade)
.venv/bin/python -m alembic upgrade head

# 3. Backend
.venv/bin/python -m backend.main
#    http://127.0.0.1:8471/health

# 4. Frontend
npm run dev
```

Tanpa key, `/api/chat` membalas 503 dan UI menampilkan
"Agent belum siap. Periksa GEMINI_API_KEY di backend/.env".

Tanpa migrasi, backend tetap start (supaya `/health` bisa melapor) tetapi
`/api/courses` dan `/api/materials` akan kosong/error, dan `/health`
mengembalikan `status: "degraded"` dengan `schema_ok: false`.

### Skema database — WAJIB migrasi

Tabel matkul dan materi dibuat oleh **Alembic**, bukan `create_all`.
`init_db()` hanya memverifikasi versi; pembuatan tabel adalah tugas Alembic.
Keduanya sengaja dipisah supaya tidak ada dua sumber kebenaran.

```bash
.venv/bin/python -m alembic upgrade head        # terapkan
.venv/bin/python -m alembic downgrade base      # batalkan
.venv/bin/python -m alembic revision --autogenerate -m "pesan"   # revisi baru
```

Tiga hal yang perlu diketahui soal migrasi:

1. **Runtime tidak pernah migrasi otomatis.** Sidecar dibundle PyInstaller
   onefile, jadi `alembic` tidak ikut ter-bundle dan `Path(__file__)` di dalam
   bundle mengarah ke `_MEIPASS` — kelas bug yang sama sudah menimpa `.env`
   (lihat "Belum Dikerjakan"). Migrasi dijalankan manual sebelum release;
   runtime hanya membaca `alembic_version` dan membandingkan dengan
   `SCHEMA_REVISION` di `backend/core/database.py`.

2. **Naikkan `SCHEMA_REVISION` setiap menambah revisi.** Nilai itu di-hardcode
   karena isinya yang diperiksa runtime, bukan dibaca dari disk.

3. **Jangan mengedit revisi yang sudah pernah ter-apply.** `alembic_version`
   tetap mencatat id yang sama padahal tabelnya berbeda, sehingga pengecekan
   versi lolos dan query gagal jauh kemudian dengan pesan yang tidak jelas
   (`no such column`). Karena itu `check_schema_revision()` juga memeriksa satu
   sentinel column per tabel dan menyebutkan yang kurang. Kalau tertinggal:
   `alembic downgrade base && alembic upgrade head`.

Data awal matkul diisi otomatis saat startup kalau tabel `courses` masih kosong
(`backend/seed/courses_seed.py`, idempoten) — kecuali dimatikan via
`SEED_DEMO_DATA=false` di `backend/.env` (`settings.seed_demo_data`, gate di
`main.py` lifespan). Untuk database 0 fresh: set flag itu, lalu
`.venv/bin/python -m backend.tools.wipe_demo_data` (hapus 13 tabel akademik,
pertahankan `alembic_version` + riwayat chat). Numbersnya dihitung dari database —
`ragFiles`, `ragChunks`, total SKS, rata-rata progress, dan hitungan quick view
semuanya agregat SQL, bukan kolom yang disimpan.

### Data matkul & materi

| Endpoint | Ganti apa |
|---|---|
| `GET /api/courses` | Satu request untuk kartu, counts quick view, dan metric. Filter + sort di SQL. |
| `GET /api/courses/{id}` | Detail: minggu silabus, slot konsultasi, tutor + `rag_namespace`. |
| `PATCH /api/courses/{id}/progress` | Tulis progres langsung, atau tandai minggu selesai (progress dihitung ulang). |
| `POST /api/courses/{id}/tutor-session` | Sesi chat ter-scope ke satu matkul. Idempoten. |
| `GET /api/materials` | Daftar file untuk FilesPage. |
| `POST /api/materials/upload` | Upload bytes ke `data/materials/` + antre ingest riil (parse/split/embed Gemini, `chunk_count` = jumlah chunks nyata, key kosong → `error`). Tanpa batas ukuran kaku. |
| `POST/PATCH/DELETE /api/materials` | Kompat metadata + update status manual. |
| `GET /api/materials/search` | Debug retrieval: top chunks satu matkul (ter-scope `offering_id`). |
| `GET /api/folders` | Folder PinnedFolders, jumlah/ukuran dihitung dari `course_materials`. |

`course_materials` dipakai dua halaman sekaligus: kartu matkul menjumlahkannya
menjadi `ragFiles`/`ragChunks`, FilesPage menampilkannya sebagai daftar file.
Bahan yang di-`join` langsung ke query utama akan menggandakan baris enrollment
dan membuat `SUM(sks)`/`AVG(progress)` salah — agregatnya selalu lewat subquery.

### CRUD matkul

Satu form di halaman Courses memakai empat endpoint. Semuanya atomik per
permintaan, jadi form yang mengirim ~15 field sekaligus tidak pernah meninggalkan
data setengah jadi.

| Endpoint | Kode | Perilaku |
|---|---|---|
| `POST /api/courses` | 201 | Buat course + offering + enrollment + dosen + tutor + minggu dalam satu transaksi |
| `PATCH /api/courses/{id}` | 200 | Partial. Field yang tidak dikirim tidak disentuh |
| `DELETE /api/courses/{id}` | 200 | Soft delete — `enrollments.status = 'dropped'` |
| `POST /api/courses/{id}/restore` | 200 | Kembalikan, asal semester offering masih aktif |

Tiga hal yang tidak terlihat dari kode dan mudah dilanggar:

**1. Urutan insert wajib, dan diacak oleh SQLAlchemy.** Model
`backend/models/course.py` sengaja tidak punya `relationship()`, dan unit of
work hanya mengurutkan flush berdasarkan relationship — bukan kolom FK. Urutan di
`create_course`/`seed_courses.py` dipisah `flush()` per level:

```
Course + Lecturer + AiTutor → CourseOffering → OfferingLecturer
  + CourseTutor + Enrollment + CourseWeek → commit
```

Melewati satu `flush()` berakhir sebagai `IntegrityError` "FOREIGN KEY
constraint failed" yang tidak menunjuk baris yang salah.

**2. Soft delete menyisakan `courses`, jadi kode tidak langsung bebas.** Kalau
`create` selalu menolak kode yang sudah ada, alur "lepas → daftar ulang" menjadi
dead-end: kode ditolak padahal pesan error-nya menyuruh mendaftarkan ulang, dan
`restore` tidak bisa dicapai dari UI karena matkul yang di-drop tidak muncul di
daftar. Karena itu `create_course` memakai ulang course + offering yang sudah ada
dan hanya menghidupkan enrollment-nya lagi. Aturannya: **409 hanya kalau user memang
sudah punya enrollment `aktif` untuk kode itu.**

**3. "Tidak dikirim" berbeda dari "dikirim `null`".** Semua patch diproses dengan
`exclude_unset=True`, jadi:

| Dikirim | Arti |
|---|---|
| `focus` tidak ada | Kolom tidak disentuh |
| `focus: null` | Kolom dikosongkan |
| `tutor: null` | Tutor dilepas → `rag_isolation` turun, `dedicatedTutors` berkurang |
| `weeks: [...]` | Hanya minggu di daftar itu yang di-upsert; sisanya **tidak dihapus** |

Menghapus minggu diam-diam akan menghapus `completed_at` yang sudah tercatat.

**4. Dosen & tutor di-form diidentifikasi by-nama, jadi `upsert` wajib konsisten
di kedua jalur.** Kartu tidak membawa `id`, jadi form mengirim `name` saja dan
`_upsert_lecturer`/`_upsert_tutor` mencari baris dengan nama itu. Yang penting:
setelah cabang `id`-diberikan / ditemukan-by-name, **baris yang sudah ada harus
menerapkan field dari form** — bukan cuma `return id` itu.

Versi pertama menerapkan `avatar_tone`/`email` hanya di jalur `id`, sehingga dosen
yang ditemukan by-name memakai ulang baris dengan tone lama padahal form mengirim
tone baru. Bug ini tidak muncul di UI dan tidak merusak apa pun — tone diam saja
salah sampai noticed.

Kalau nanti form mulai mengirim `id` (mis. daftar dosen yang bisa dipilih), kedua
jalur itu harus tetap menghasilkan perilaku yang sama.

### Pemetaan error

`IntegrityError` dipetakan di `routers/courses.py::_conflict`. Pesan SQLite untuk
`UNIQUE` menyebut **kolom**, bukan nama constraint (`"UNIQUE constraint failed:
courses.code"`), sedangkan `CHECK` menyebut **nama constraint** — tabel pemetaan
mengikuti itu. Konflik domain yang tidak menyentuh database (mis. "sudah
dilepas dari semester") memakai exception `course_service.Conflict` → 409.

### Uji agent langsung

```bash
.venv/bin/python -m backend.tests.smoke_agent
```

Tiga kasus: konsep dasar (tanpa tool), pertanyaan yang butuh pencarian
(memakai `web_search`), dan di luar domain (memverifikasi agent menolak
menulis esai utuh). Keluar dengan kode 2 kalau agent belum siap.

### Perintah verifikasi

```bash
# Test + paritas data + kontrak dokumentasi
.venv/bin/python -m pytest backend/tests/ -q
.venv/bin/python -m backend.tools.check_seed_parity
.venv/bin/python -m backend.tools.check_aliases
.venv/bin/python -m backend.tools.check_docs_claims

# Skema
.venv/bin/python -m alembic check          # harus: No new upgrade operations

# Frontend
npx tsc -b --noEmit
npx oxlint src/
npm run build

# Kebersihan
.venv/bin/python -m compileall -q backend
```

Tiga tool di `backend/tools/` semuanya punya alasan:

| Tool | Untuk apa |
|---|---|
| `check_seed_parity` | Angka turunan (metrics, counts, kartu) harus sama dengan mock lama yang diganti database |
| `check_aliases` | Kunci JSON harus persis seperti yang dibaca komponen frontend |
| `check_docs_claims` | Klaim di `agent.md` / `integrasi.md` masih cocok dengan kodenya |

`check_docs_claims` juga dijalankan sebagai test, jadi dokumentasi yang mulai
melenceng gagal di `pytest` — bukan baruketahuan kalau kebetulan dibaca.

---

## Rujukan API

### ADK 2.10.0

Semua asumsi diverifikasi dari tag `v2.10.0` di `github.com/google/adk-python`,
bukan dari dokumentasi yang bisa sudah lebih baru.

**`Runner.__init__`** — keyword-only, tepat satu dari `app` / `agent` / `node`:
```python
Runner(*, app=None, app_name=None, agent=None, node=None,
       plugins=None, artifact_service=None, session_service,  # wajib
       memory_service=None, credential_service=None,
       plugin_close_timeout=5.0, auto_create_session=False)
```

**`App`** — field: `name`, `root_agent`, `plugins`,
`events_compaction_config`, `context_cache_config`, `resumability_config`.
Validasi `name` ketat, dan `root_agent` wajib ada.

**`Gemini`** — field: `model` (default `gemini-2.5-flash`), `client`,
`client_kwargs`, `base_url`, `api_version`, `speech_config`,
`use_interactions_api`, `retry_options`. `supported_models()` mencocokkan
regex `gemini-.*`, jadi `gemini-2.0-flash` didukung.

**`RunConfig`** — `max_llm_calls` (default 500, bisa di-override lewat env
`ADK_MAX_LLM_CALLS`). Dipakai untuk membatasi iterasi.

**`Event`** — turunan `LlmResponse`. Field relevan: `author`, `content`,
`partial`, `error_code`, `error_message`, `is_final_response()`.

### Model

`gemini-2.0-flash` dipertahankan sesuai keputusan awal. Kalau API ternyata
menolaknya, fallback cukup mengubah `GEMINI_MODEL` di `backend/.env` ke
`gemini-2.5-flash` — itu default ADK sendiri, tanpa perubahan kode.

### react-markdown

`peerDependencies: { react: ">=18" }`. Mengubah AST markdown menjadi React
element lewat `hast-util-to-jsx-runtime`, **bukan** `dangerouslySetInnerHTML`
— jadi tidak ada kebutuhan sanitizer HTML terpisah. Raw HTML di dalam
markdown juga diabaikan secara default.
