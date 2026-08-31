use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};

use crate::kernel;
use crate::web::{AppState, check_auth};

pub async fn get_kernel_info(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<kernel::KernelInfoResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let status_guard = state.kernel_download_status.read().await;
    let info = kernel::get_kernel_info(&status_guard);
    Ok(Json(info))
}

pub async fn get_kernel_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<kernel::KernelDownloadStatus>, StatusCode> {
    check_auth(&state, &headers).await?;
    let status_guard = state.kernel_download_status.read().await;
    Ok(Json(status_guard.clone()))
}

pub async fn download_kernel(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    {
        let status_guard = state.kernel_download_status.read().await;
        if status_guard.status == "downloading" || status_guard.status == "extracting" {
            return Ok(Json(serde_json::json!({
                "status": "in_progress",
                "message": "内核下载正在进行中..."
            })));
        }
    }

    state
        .kernel_download_cancel
        .store(false, std::sync::atomic::Ordering::SeqCst);
    let status_lock_clone = state.kernel_download_status.clone();
    let cancel_flag_clone = state.kernel_download_cancel.clone();

    tokio::spawn(async move {
        if let Err(e) =
            kernel::download_and_install_kernel(status_lock_clone, cancel_flag_clone).await
        {
            eprintln!("[Kernel] Download and install task ended: {}", e);
        }
    });

    Ok(Json(serde_json::json!({
        "status": "started",
        "message": "已开始下载 sing-box 内核"
    })))
}

pub async fn cancel_download(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    state
        .kernel_download_cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    {
        let mut st = state.kernel_download_status.write().await;
        st.status = "idle".to_string();
        st.progress = 0.0;
        st.speed_bytes_per_sec = 0;
        st.error = Some("下载已取消".to_string());
    }

    Ok(Json(serde_json::json!({
        "status": "cancelled",
        "message": "已取消内核下载"
    })))
}
