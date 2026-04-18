use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::sleep;

const DEFAULT_EXTERNAL_URL: &str = "http://127.0.0.1:8080";
const PROBE_TIMEOUT: Duration = Duration::from_millis(500);
const SPAWN_HEALTH_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NodeStatus {
    Pending,
    External {
        #[serde(rename = "baseUrl")]
        base_url: String,
    },
    Managed {
        #[serde(rename = "baseUrl")]
        base_url: String,
        #[serde(rename = "authToken")]
        auth_token: Option<String>,
        #[serde(rename = "dataDir")]
        data_dir: String,
    },
    Failed {
        reason: String,
    },
}

#[derive(Clone)]
pub struct NodeHandle {
    child: Arc<AsyncMutex<Option<CommandChild>>>,
}

impl NodeHandle {
    fn new(child: CommandChild) -> Self {
        Self {
            child: Arc::new(AsyncMutex::new(Some(child))),
        }
    }

    pub fn stop(&self) {
        let child = self.child.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(child) = child.lock().await.take() {
                let _ = child.kill();
            }
        });
    }
}

pub struct BootstrapResult {
    pub status: NodeStatus,
    pub handle: Option<NodeHandle>,
}

pub async fn bootstrap(app: &AppHandle) -> Result<BootstrapResult> {
    if probe(DEFAULT_EXTERNAL_URL).await {
        return Ok(BootstrapResult {
            status: NodeStatus::External {
                base_url: DEFAULT_EXTERNAL_URL.to_string(),
            },
            handle: None,
        });
    }
    spawn_managed(app).await
}

async fn probe(base_url: &str) -> bool {
    let Ok(client) = reqwest::Client::builder().timeout(PROBE_TIMEOUT).build() else {
        return false;
    };
    let url = format!("{}/api/chain/info", base_url.trim_end_matches('/'));
    match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => r
            .json::<serde_json::Value>()
            .await
            .map(|v| v.get("genesisHash").is_some())
            .unwrap_or(false),
        _ => false,
    }
}

async fn spawn_managed(app: &AppHandle) -> Result<BootstrapResult> {
    let data_dir = app
        .path()
        .app_data_dir()
        .context("resolve app data dir")?
        .join("node");
    std::fs::create_dir_all(&data_dir).context("create node data dir")?;

    let port = pick_port().unwrap_or(8080);
    let base_url = format!("http://127.0.0.1:{port}");

    let command = app
        .shell()
        .sidecar("lattice-node")
        .context("missing bundled lattice-node sidecar — see src-tauri/binaries/README.md")?
        .args([
            "--rpc-port",
            &port.to_string(),
            "--data-dir",
            data_dir.to_string_lossy().as_ref(),
            "--rpc-auth",
            "cookie",
        ]);

    let (mut rx, child) = command.spawn().context("spawn lattice-node sidecar")?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    if let Ok(s) = std::str::from_utf8(&line) {
                        eprintln!("[lattice-node] {s}");
                    }
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[lattice-node] terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    let handle = NodeHandle::new(child);

    wait_for_health(&base_url).await?;
    let auth_token = read_cookie(&data_dir).ok();

    Ok(BootstrapResult {
        status: NodeStatus::Managed {
            base_url,
            auth_token,
            data_dir: data_dir.to_string_lossy().to_string(),
        },
        handle: Some(handle),
    })
}

fn pick_port() -> Option<u16> {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
}

async fn wait_for_health(base_url: &str) -> Result<()> {
    let start = std::time::Instant::now();
    while start.elapsed() < SPAWN_HEALTH_TIMEOUT {
        if probe(base_url).await {
            return Ok(());
        }
        sleep(Duration::from_millis(250)).await;
    }
    Err(anyhow!(
        "managed node did not become healthy within {SPAWN_HEALTH_TIMEOUT:?}"
    ))
}

fn read_cookie(data_dir: &PathBuf) -> Result<String> {
    let path = data_dir.join(".cookie");
    let contents = std::fs::read_to_string(&path).context("read .cookie")?;
    Ok(contents.trim().to_string())
}
