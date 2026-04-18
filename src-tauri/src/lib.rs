mod node;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

use node::{NodeHandle, NodeStatus};

struct AppState {
    node: Mutex<Option<NodeHandle>>,
    status: Mutex<NodeStatus>,
}

#[tauri::command]
fn get_node_status(state: State<'_, AppState>) -> NodeStatus {
    state.status.lock().unwrap().clone()
}

#[tauri::command]
fn read_node_identity(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let status = state.status.lock().unwrap().clone();
    let managed_dir = match &status {
        NodeStatus::Managed { data_dir, .. } => Some(PathBuf::from(data_dir)),
        _ => None,
    };
    let candidates: Vec<PathBuf> = [
        managed_dir,
        app.path()
            .app_data_dir()
            .ok()
            .map(|p| p.join("node")),
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|h| h.join(".lattice")),
    ]
    .into_iter()
    .flatten()
    .map(|d| d.join("identity.json"))
    .collect();

    for path in &candidates {
        if path.exists() {
            return std::fs::read_to_string(path)
                .map(Some)
                .map_err(|e| format!("{}: {}", path.display(), e));
        }
    }
    Ok(None)
}

#[tauri::command]
async fn restart_node(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<NodeStatus, String> {
    if let Some(handle) = state.node.lock().unwrap().take() {
        handle.stop();
    }
    let result = node::bootstrap(&app).await.map_err(|e| e.to_string())?;
    *state.node.lock().unwrap() = result.handle;
    *state.status.lock().unwrap() = result.status.clone();
    Ok(result.status)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .manage(AppState {
            node: Mutex::new(None),
            status: Mutex::new(NodeStatus::Pending),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let status = match node::bootstrap(&handle).await {
                    Ok(result) => {
                        let state = handle.state::<AppState>();
                        *state.node.lock().unwrap() = result.handle;
                        result.status
                    }
                    Err(e) => NodeStatus::Failed {
                        reason: e.to_string(),
                    },
                };
                let state = handle.state::<AppState>();
                *state.status.lock().unwrap() = status.clone();
                let _ = handle.emit("node://status", status);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    let state = window.state::<AppState>();
                    let taken = state.node.lock().unwrap().take();
                    if let Some(handle) = taken {
                        handle.stop();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_node_status, restart_node, read_node_identity])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
