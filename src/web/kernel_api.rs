use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use futures_util::FutureExt;

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
    let status_lock_for_panic = state.kernel_download_status.clone();
    let cancel_flag_clone = state.kernel_download_cancel.clone();

    tokio::spawn(async move {
        // catch_unwind 兜底：下载任务若因 panic 终止，这里将状态置为 error，
        // 避免前端永远轮询到 "downloading" 的僵尸状态（进度条卡死无任何反馈）
        let result = std::panic::AssertUnwindSafe(
            kernel::download_and_install_kernel(status_lock_clone, cancel_flag_clone),
        )
        .catch_unwind()
        .await;

        match result {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                eprintln!("[Kernel] Download and install task ended: {e}");
            }
            Err(panic_err) => {
                eprintln!("[Kernel] Download task panicked: {panic_err:?}");
                let mut st = status_lock_for_panic.write().await;
                if st.status == "downloading" || st.status == "extracting" {
                    st.status = "error".to_string();
                    st.error = Some("内核下载任务异常终止，请重试或手动安装内核".to_string());
                }
            }
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
