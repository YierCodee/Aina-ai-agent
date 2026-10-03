# Taruh hasil PyInstaller di sini dengan pola nama:
#   fastapi-server-x86_64-unknown-linux-gnu
#   fastapi-server-x86_64-pc-windows-msvc.exe
#   fastapi-server-aarch64-apple-darwin
#
# Tauri memakai `externalBin: ["binaries/fastapi-server"]` di tauri.conf.json
# lalu menambahkan suffix target secara otomatis saat bundling.
# Lihat: backend/build_sidecar.sh
