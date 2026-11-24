use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use sha2::Digest;

use crate::db;
use crate::web::{AppState, check_auth, get_db_conn};

/// True while the stored hash is still the factory default `admin`.
/// Used only by the public login page to decide whether to show the hint.
pub fn is_default_admin_hash(stored_hash: Option<&str>) -> bool {
    let default_hash = db::hash_password("admin");
    stored_hash == Some(default_hash.as_str())
}

/// Reset the panel password from the host machine (CLI `reset-password`).
/// Refuses to run when the password is pinned by ADMIN_PASSWORD, since that
/// environment variable always wins over the database value at login time.
pub fn reset_admin_password(db_path: &str, new_password: &str) -> anyhow::Result<()> {
    let new_password = new_password.trim();
    if new_password.is_empty() {
        anyhow::bail!("新密码不能为空");
    }
    if std::env::var("ADMIN_PASSWORD").is_ok() {
        anyhow::bail!("管理员密码由环境变量 ADMIN_PASSWORD 设置，CLI 重置无效；请修改环境变量后重启服务");
    }
    let conn = db::init_db(db_path)?;
    db::update_setting(&conn, "password_hash", &db::hash_password(new_password))?;
    Ok(())
}

/// Public (pre-login) state for the login page. Deliberately minimal: it only
/// tells the UI whether the factory-default hint applies and whether the
/// password is managed outside the database.
pub async fn password_state(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if std::env::var("ADMIN_PASSWORD").is_ok() {
        return Ok(Json(serde_json::json!({
            "is_default": false,
            "is_env_set": true
        })));
    }
    let conn = get_db_conn(&state.db_path)?;
    let stored_hash = db::get_setting(&conn, "password_hash")
        .unwrap_or_default()
        .unwrap_or_default();
    Ok(Json(serde_json::json!({
        "is_default": is_default_admin_hash(Some(&stored_hash)),
        "is_env_set": false
    })))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: Option<String>,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, StatusCode> {
    let input_password = payload.password.unwrap_or_default();

    let authenticated = if let Ok(env_pw) = std::env::var("ADMIN_PASSWORD") {
        env_pw == input_password
    } else {
        let conn = get_db_conn(&state.db_path)?;
        if let Ok(Some(stored_hash)) = db::get_setting(&conn, "password_hash") {
            let input_hash = db::hash_password(&input_password);
            stored_hash == input_hash
        } else {
            false
        }
    };

    if authenticated {
        // Generate random session token
        let token = format!(
            "{:x}",
            sha2::Sha256::digest(format!("session-{}", rand_string()).as_bytes())
        );
        let mut guard = state.session_token.write().await;
        *guard = Some(token.clone());
        Ok(Json(LoginResponse { token }))
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

fn rand_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{now}")
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let mut guard = state.session_token.write().await;
    *guard = None;
    Ok(StatusCode::OK)
}

pub async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: Option<String>,
    pub new_password: Option<String>,
}

pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    if std::env::var("ADMIN_PASSWORD").is_ok() {
        return Err((
            StatusCode::FORBIDDEN,
            "管理员密码由环境变量 ADMIN_PASSWORD 设置，请在服务端修改后重启服务".to_string(),
        ));
    }

    let conn = get_db_conn(&state.db_path)
        .map_err(|s| (s, "数据库连接失败".to_string()))?;
    let stored_hash = db::get_setting(&conn, "password_hash")
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "读取密码哈希失败".to_string()))?
        .ok_or((
            StatusCode::INTERNAL_SERVER_ERROR,
            "未找到密码哈希，请重新初始化系统".to_string(),
        ))?;

    let old_pw = payload.old_password.unwrap_or_default();
    if db::hash_password(&old_pw) != stored_hash {
        return Err((StatusCode::BAD_REQUEST, "当前密码不正确".to_string()));
    }

    let new_pw = payload.new_password.unwrap_or_default();
    if new_pw.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "新密码不能为空".to_string()));
    }

    let new_hash = db::hash_password(&new_pw);
    db::update_setting(&conn, "password_hash", &new_hash)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "保存新密码失败".to_string()))?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "管理员密码已更新，并立即在当前会话生效"
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::State;
    use axum::http::{HeaderMap, HeaderValue};
    use std::sync::Arc;
    use tokio::sync::RwLock;

    #[test]
    fn default_admin_hash_detection() {
        assert!(is_default_admin_hash(Some(&db::hash_password("admin"))));
        assert!(!is_default_admin_hash(Some(&db::hash_password("secret"))));
        assert!(!is_default_admin_hash(None));
        assert!(!is_default_admin_hash(Some("")));
    }

    #[test]
    fn reset_admin_password_writes_the_new_hash() {
        let db_path = std::env::temp_dir()
            .join(format!("subout-reset-password-{}.db", uuid::Uuid::new_v4()))
            .to_string_lossy()
            .to_string();
        let conn = db::init_db(&db_path).unwrap();
        db::update_setting(&conn, "password_hash", &db::hash_password("old-secret")).unwrap();
        drop(conn);

        reset_admin_password(&db_path, "admin").unwrap();

        let conn = rusqlite::Connection::open(&db_path).unwrap();
        let stored = db::get_setting(&conn, "password_hash").unwrap().unwrap();
        assert_eq!(stored, db::hash_password("admin"));
        drop(conn);
        let _ = std::fs::remove_file(&db_path);
    }
    fn test_state(db_path: &str) -> AppState {
        let (tx, _) = tokio::sync::broadcast::channel(16);
        AppState {
            db_path: db_path.to_string(),
            session_token: Arc::new(RwLock::new(None)),
            kernel_download_status: Arc::new(RwLock::new(Default::default())),
            kernel_download_cancel: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            service_manager: Arc::new(crate::service::SingBoxServiceManager::new()),
            auto_update_status: Arc::new(RwLock::new(Default::default())),
            auto_update_tx: tx,
        }
    }

    /// Full regression: default hint -> change password -> hint disappears ->
    /// CLI reset restores the default -> custom reset keeps hint hidden.
    #[tokio::test]
    async fn default_hint_change_and_reset_flow() {
        // ADMIN_PASSWORD overrides the database entirely; this flow only
        // applies to database-managed passwords.
        if std::env::var("ADMIN_PASSWORD").is_ok() {
            return;
        }

        let db_path = std::env::temp_dir()
            .join(format!("subout-auth-flow-{}.db", uuid::Uuid::new_v4()))
            .to_string_lossy()
            .to_string();
        drop(db::init_db(&db_path).unwrap());
        let state = test_state(&db_path);

        let initial = password_state(State(state.clone())).await.unwrap().0;
        assert_eq!(initial["is_default"].as_bool(), Some(true));
        assert_eq!(initial["is_env_set"].as_bool(), Some(false));

        let logged_in = login(
            State(state.clone()),
            Json(LoginRequest {
                password: Some("admin".to_string()),
            }),
        )
        .await
        .unwrap();
        assert!(!logged_in.0.token.is_empty());

        let mut headers = HeaderMap::new();
        headers.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {}", logged_in.0.token)).unwrap(),
        );
        let changed = change_password(
            State(state.clone()),
            headers,
            Json(ChangePasswordRequest {
                old_password: Some("admin".to_string()),
                new_password: Some("new-secret".to_string()),
            }),
        )
        .await
        .unwrap();
        assert_eq!(changed.0["status"], "success");

        let after_change = password_state(State(state.clone())).await.unwrap().0;
        assert_eq!(after_change["is_default"].as_bool(), Some(false));
        assert!(
            login(
                State(state.clone()),
                Json(LoginRequest {
                    password: Some("admin".to_string()),
                }),
            )
            .await
            .is_err()
        );
        assert!(
            login(
                State(state.clone()),
                Json(LoginRequest {
                    password: Some("new-secret".to_string()),
                }),
            )
            .await
            .is_ok()
        );

        reset_admin_password(&db_path, "admin").unwrap();
        let after_reset = password_state(State(state.clone())).await.unwrap().0;
        assert_eq!(after_reset["is_default"].as_bool(), Some(true));
        assert!(
            login(
                State(state.clone()),
                Json(LoginRequest {
                    password: Some("admin".to_string()),
                }),
            )
            .await
            .is_ok()
        );

        reset_admin_password(&db_path, "custom-789").unwrap();
        let after_custom = password_state(State(state.clone())).await.unwrap().0;
        assert_eq!(after_custom["is_default"].as_bool(), Some(false));
        assert!(
            login(
                State(state.clone()),
                Json(LoginRequest {
                    password: Some("custom-789".to_string()),
                }),
            )
            .await
            .is_ok()
        );
        assert!(
            login(
                State(state),
                Json(LoginRequest {
                    password: Some("admin".to_string()),
                }),
            )
            .await
            .is_err()
        );

        let _ = std::fs::remove_file(&db_path);
    }

}
