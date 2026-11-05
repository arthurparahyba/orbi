// Vigia desktop shell: a window around the React UI, plus the local runtime.
//
// On start it checks whether the runtime already answers on 127.0.0.1:3000
// (e.g. `npm start` in a terminal). If not, it launches `node dist/server.mjs`
// from the runtime folder and stops it when the window closes.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};

const RUNTIME_ADDR: &str = "127.0.0.1:3000";

struct Runtime(Mutex<Option<Child>>);

fn runtime_up() -> bool {
    let addr: SocketAddr = RUNTIME_ADDR.parse().expect("valid address");
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Runtime folder: $VIGIA_RUNTIME_DIR, else the repo this app was built from.
fn runtime_dir() -> PathBuf {
    std::env::var_os("VIGIA_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."))
}

fn start_runtime() -> Option<Child> {
    if runtime_up() {
        eprintln!("[vigia] runtime já está rodando em {RUNTIME_ADDR}");
        return None;
    }
    let dir = runtime_dir();
    let entry = dir.join("dist/server.mjs");
    if !entry.exists() {
        eprintln!("[vigia] {} não existe — rode `npm run build` na pasta do runtime", entry.display());
        return None;
    }
    let node = std::env::var("VIGIA_NODE").unwrap_or_else(|_| "node".into());
    let child = Command::new(node)
        .arg(&entry)
        .current_dir(&dir)
        .env("PORT", "3000")
        .env("VIGIA_PARENT_PID", std::process::id().to_string())
        .stdin(Stdio::null())
        .spawn();
    match child {
        Ok(child) => {
            let deadline = Instant::now() + Duration::from_secs(15);
            while Instant::now() < deadline && !runtime_up() {
                std::thread::sleep(Duration::from_millis(200));
            }
            eprintln!("[vigia] runtime iniciado (pid {})", child.id());
            Some(child)
        }
        Err(err) => {
            eprintln!("[vigia] não consegui iniciar o node: {err}");
            None
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            app.manage(Runtime(Mutex::new(start_runtime())));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Vigia");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(mut child) = handle.state::<Runtime>().0.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
