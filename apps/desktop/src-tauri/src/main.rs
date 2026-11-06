// Orbi desktop shell: a window around the React UI, plus the local runtime.
//
// The runtime is started with the window and stopped with it. Two layouts:
//
// * Installed app (`npm run build` at the repo root): the runtime ships inside the
//   bundle (Resources/runtime) with its own Node next to the executable. Data,
//   `.env` and logs live in the user's app-data folder
//   (macOS: ~/Library/Application Support/br.com.zup.orbi).
// * Development (`npm run dev`): the runtime is ../../runtime in this repo, run with
//   the `node` on PATH, data in runtime/data.
//
// If something already answers on 127.0.0.1:3000 (e.g. `npm run demo`), that is used.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{App, Manager, RunEvent};

const RUNTIME_ADDR: &str = "127.0.0.1:3000";

struct Runtime(Mutex<Option<Child>>);

fn runtime_up() -> bool {
    let addr: SocketAddr = RUNTIME_ADDR.parse().expect("valid address");
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

struct Launch {
    node: PathBuf,
    runtime: PathBuf,
    /// Working dir and data location; None = development layout (runtime/data).
    home: Option<PathBuf>,
}

fn bundled(app: &App) -> Option<Launch> {
    let runtime = app.path().resource_dir().ok()?.join("runtime");
    if !runtime.join("dist/server.mjs").exists() {
        return None;
    }
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let node = exe_dir.join(if cfg!(windows) { "orbi-node.exe" } else { "orbi-node" });
    let home = app.path().app_data_dir().ok()?;
    Some(Launch { node, runtime, home: Some(home) })
}

fn development() -> Launch {
    let runtime = std::env::var_os("ORBI_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../runtime"));
    let node = std::env::var_os("ORBI_NODE").map(PathBuf::from).unwrap_or_else(|| "node".into());
    Launch { node, runtime, home: None }
}

/// Apps opened from Finder/Dock get a bare PATH (/usr/bin:/bin…), so git, gh, aws
/// and python from Homebrew wouldn't be found. Ask the user's login shell for its PATH.
fn login_shell_path() -> Option<String> {
    if cfg!(windows) {
        return None;
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = Command::new(shell)
        .args(["-ilc", "printf '__PATH__%s' \"$PATH\""])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let path = text.rsplit("__PATH__").next()?.trim().to_string();
    (!path.is_empty()).then_some(path)
}

/// First run of the installed app: create the data folder and a `.env` to fill in.
fn prepare_home(home: &Path, runtime: &Path) {
    let _ = fs::create_dir_all(home.join("data"));
    let _ = fs::create_dir_all(home.join("logs"));
    // Plugins (e.g. the company's LLM connection) live here, outside the app bundle,
    // so updating Orbi never removes them.
    let _ = fs::create_dir_all(home.join("plugins"));
    let env = home.join(".env");
    if !env.exists() {
        let _ = fs::copy(runtime.join(".env.example"), &env);
    }
}

fn start_runtime(app: &App) -> Option<Child> {
    if runtime_up() {
        eprintln!("[orbi] usando o runtime que já está em {RUNTIME_ADDR}");
        return None;
    }
    let launch = bundled(app).unwrap_or_else(development);
    let entry = launch.runtime.join("dist/server.mjs");
    if !entry.exists() {
        eprintln!("[orbi] {} não existe — rode `npm run build` em runtime/", entry.display());
        return None;
    }

    let mut cmd = Command::new(&launch.node);
    cmd.arg(&entry)
        .env("PORT", "3000")
        .env("ORBI_PARENT_PID", std::process::id().to_string())
        .stdin(Stdio::null());

    match &launch.home {
        Some(home) => {
            prepare_home(home, &launch.runtime);
            // Relative paths in the runtime (.env, data/, workspace/) resolve here.
            cmd.current_dir(home)
                .env("ORBI_DATA_DIR", home.join("data"))
                .env("ORBI_FLUE_DB", home.join("data/flue.db"))
                .env("ORBI_WORKSPACE", home.join("workspace"))
                .env("ORBI_PLUGINS_DIR", home.join("plugins"));
            if let Some(path) = login_shell_path() {
                cmd.env("PATH", path);
            }
            let log = OpenOptions::new().create(true).append(true).open(home.join("logs/runtime.log"));
            if let Ok(log) = log {
                if let Ok(err) = log.try_clone() {
                    cmd.stdout(log).stderr(err);
                }
            }
        }
        None => {
            cmd.current_dir(&launch.runtime);
        }
    }

    match cmd.spawn() {
        Ok(child) => {
            eprintln!("[orbi] runtime iniciado (pid {}) a partir de {}", child.id(), launch.runtime.display());
            Some(child)
        }
        Err(err) => {
            eprintln!("[orbi] não consegui iniciar {}: {err}", launch.node.display());
            None
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            // The window opens right away; the UI shows "conectando" until the runtime answers.
            let child = start_runtime(app);
            app.manage(Runtime(Mutex::new(child)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Orbi");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(mut child) = handle.state::<Runtime>().0.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
