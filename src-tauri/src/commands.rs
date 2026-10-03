//! Tauri commands yang di-invoke dari frontend via `invoke()`.
//!
//! Berisi perintah untuk mengecek status FastAPI sidecar.

use serde::Serialize;
use std::time::Duration;

/// Status kesehatan FastAPI sidecar.
#[derive(Debug, Serialize)]
pub struct SidecarStatus {
    pub running: bool,
    pub url: String,
    pub detail: String,
}

fn sidecar_base_url() -> String {
    std::env::var("FASTAPI_SIDECAR_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8471".to_string())
}

/// Cek apakah FastAPI sidecar sudah jalan dengan memanggil `GET /health`.
#[tauri::command]
pub async fn sidecar_status() -> SidecarStatus {
    let base = sidecar_base_url();
    let url = format!("{base}/health");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .no_proxy()
        .build();

    let client = match client {
        Ok(c) => c,
        Err(e) => {
            return SidecarStatus {
                running: false,
                url: base,
                detail: format!("gagal membuat http client: {e}"),
            }
        }
    };

    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let detail = resp.text().await.unwrap_or_else(|_| "ok".to_string());
            SidecarStatus {
                running: true,
                url: base,
                detail,
            }
        }
        Ok(resp) => SidecarStatus {
            running: false,
            url: base,
            detail: format!("health check HTTP {}", resp.status()),
        },
        Err(e) => SidecarStatus {
            running: false,
            url: base,
            detail: format!("sidecar belum terjangkau: {e}"),
        },
    }
}

/// Perintah sapaan contoh — berguna untuk smoke test invoke().
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Halo, {name}! Sidecar FastAPI siap di-invoke dari Tauri.")
}
