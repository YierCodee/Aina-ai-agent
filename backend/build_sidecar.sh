#!/usr/bin/env bash
# Build FastAPI sidecar binary via PyInstaller → src-tauri/binaries/
#
# Pemakaian:
#   ./backend/build_sidecar.sh
#
# Hasil: src-tauri/binaries/fastapi-server-<target-triple>[.exe]
# Contoh Linux x86_64: fastapi-server-x86_64-unknown-linux-gnu
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/src-tauri/binaries"

TRIPLE="${TARGET_TRIPLE:-$(rustc -vV 2>/dev/null | sed -n 's/^host: //p')}"
if [[ -z "${TRIPLE:-}" ]]; then
  TRIPLE="x86_64-unknown-linux-gnu"
fi

BIN_NAME="fastapi-server-${TRIPLE}"
[[ "$TRIPLE" == *"windows"* ]] && BIN_NAME="${BIN_NAME}.exe"

echo "→ Building sidecar: $BIN_NAME"
python3 -m pip install --upgrade pip pyinstaller
python3 -m pip install -r "$ROOT/backend/requirements.txt"

# Bersihkan build lama agar binary tidak basi
rm -rf "$ROOT/build" "$ROOT/dist" "$ROOT"/*.spec

pyinstaller \
  --noconfirm \
  --onefile \
  --name "$BIN_NAME" \
  --distpath "$OUT_DIR" \
  --workpath "$ROOT/build" \
  --specpath "$ROOT" \
  --paths "$ROOT" \
  --collect-all uvicorn \
  --collect-all fastapi \
  --collect-all sqlalchemy \
  --collect-all aiosqlite \
  --collect-all google_adk \
  --collect-all google.genai \
  "$ROOT/backend/main.py"

echo "✓ Sidecar tersedia di: $OUT_DIR/$BIN_NAME"
