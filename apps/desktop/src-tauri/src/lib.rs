struct LocalApi(std::sync::Mutex<std::process::Child>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(all(not(debug_assertions), target_os = "windows"))]
    let builder = builder
        .setup(|app| {
            use std::{
                io::{Error, ErrorKind},
                net::TcpStream,
                process::{Command, Stdio},
                sync::Mutex,
                thread,
                time::{Duration, Instant},
            };
            use tauri::{path::BaseDirectory, Manager};

            let resource_dir = app.path().resolve("api", BaseDirectory::Resource)?;
            let api_exe = resource_dir.join("SHOPNEX-API.exe");
            if !api_exe.is_file() {
                return Err(Box::new(Error::new(
                    ErrorKind::NotFound,
                    "Bundled SHOPNEX local API was not found. Reinstall the official desktop package.",
                )));
            }
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            if TcpStream::connect(("127.0.0.1", 8000)).is_ok() {
                return Err(Box::new(Error::new(
                    ErrorKind::AddrInUse,
                    "Port 8000 is already in use. Close any other SHOPNEX/API instance and try again.",
                )));
            }

            let mut child = Command::new(&api_exe)
                .env("SHOPNEX_DATA_DIR", &data_dir)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;

            let deadline = Instant::now() + Duration::from_secs(45);
            let mut ready = false;
            while Instant::now() < deadline {
                if TcpStream::connect(("127.0.0.1", 8000)).is_ok() {
                    ready = true;
                    break;
                }
                if let Some(status) = child.try_wait()? {
                    return Err(Box::new(Error::new(
                        ErrorKind::Other,
                        format!("SHOPNEX local API stopped during startup: {status}"),
                    )));
                }
                thread::sleep(Duration::from_millis(300));
            }
            if !ready {
                let _ = child.kill();
                return Err(Box::new(Error::new(
                    ErrorKind::TimedOut,
                    "SHOPNEX local API did not become ready within 45 seconds.",
                )));
            }
            app.manage(LocalApi(Mutex::new(child)));
            Ok(())
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("failed to build SHOPNEX desktop application");
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            use tauri::Manager;
            if let Some(api) = app_handle.try_state::<LocalApi>() {
                if let Ok(mut child) = api.0.lock() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}
