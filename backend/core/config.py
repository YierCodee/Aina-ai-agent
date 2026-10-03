"""Konfigurasi terpusat FastAPI sidecar.

Sumber tunggal untuk semua API key. Baca dari environment / backend/.env.
Jangan baca os.getenv("GEMINI_API_KEY") langsung di modul lain —
selalu import `settings` dari sini.
"""
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Agent FastAPI Sidecar"
    version: str = "0.1.0"
    host: str = "127.0.0.1"
    port: int = 8471

    # --- Gemini (adjustment point: ubah default model di sini / via .env) ---
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    gemini_timeout: int = 60
    gemini_max_retries: int = 2

    # --- Agent (Google ADK) ---
    # PENTING: adk_app_name HARUS cocok regex ^[a-zA-Z][a-zA-Z0-9_-]*$ dan
    # tidak boleh "user" — ADK melempar ValueError saat App() dibangun.
    # Jangan pakai app_name di atas (bisa mengandung spasi).
    adk_app_name: str = "asisten_kuliah"
    # Batas jumlah panggilan LLM per turn — mencegah loop tanpa akhir saat
    # model terus memanggil web_search. 0 = tanpa batas (jangan dipakai).
    agent_max_llm_calls: int = 8
    # Suhu rendah supaya jawaban konsisten dan tidak melebar kemana-mana.
    agent_temperature: float = 0.3
    # Batas durasi satu turn chat sebelum dibatalkan.
    agent_turn_timeout: int = 120

    # --- Tavily (web search, opsional) ---
    tavily_api_key: str = ""
    tavily_max_results: int = 5

    # --- LMS Bebas UMPO (scraper Playwright, opsional) ---
    # Kredensial dibaca dari LMS_USERNAME / LMS_PASSWORD di backend/.env.
    # Prefix env dikosongkan (lihat model_config), jadi nama field harus
    # huruf kecil dari nama env: lms_base_url <- LMS_BASE_URL, dst.
    lms_base_url: str = "https://bebas.umpo.ac.id"
    lms_username: str = ""
    lms_password: str = ""

    # --- RAG materi (upload lokal + ingest + embedding) ---
    # Direktori penyimpanan byte file upload. Di bawah ./data/ supaya ikut
    # .gitignore (data/ sudah di-ignore) dan tidak ter-commit.
    storage_dir: str = "./data/materials"
    # Model embedding Gemini untuk isi vector store lokal.
    gemini_embed_model: str = "gemini-embedding-001"
    # Ukuran chunk karakter + overlap. 800/100 cocok untuk slide/modul.
    rag_chunk_size: int = 800
    rag_chunk_overlap: int = 100
    # Jumlah chunks yang disuntik ke prompt tutor saat retrieval.
    rag_top_k: int = 5

    # --- Seed demo (data contoh matkul) ---
    # True = isi data awal otomatis saat tabel courses kosong (perilaku lama).
    # Set false (SEED_DEMO_DATA=false) untuk database fresh/nol permanen —
    # restart backend tidak akan mengisi ulang data dummy.
    seed_demo_data: bool = True

    # --- Database (SQLite riwayat chat) ---
    # URL async untuk tabel milik aplikasi (SQLAlchemy + aiosqlite).
    database_url: str = "sqlite+aiosqlite:///./data/app.db"
    # URL sync untuk state internal ADK (DatabaseSessionService).
    # Dipisah dari app.db agar lock ADK tidak mengganggu query riwayat.
    # ADK 2.10 butuh driver async (sqlite+aiosqlite://), bukan sqlite://.
    adk_database_url: str = "sqlite+aiosqlite:///./data/adk_sessions.db"

    model_config = {
        # Kosongkan prefix agar GEMINI_API_KEY / TAVILY_API_KEY terbaca langsung.
        "env_prefix": "",
        # Cari backend/.env relatif dari file ini (core/config.py -> backend/.env).
        "env_file": str(Path(__file__).resolve().parent.parent / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

settings = Settings()
