mod app_updater;
mod audio;
mod config_watcher;
mod daemon_streaming;
mod daemon_watcher;
mod plugin_streaming;
mod plugin_updater;
mod plugin_watcher;
mod socket_proxy;
mod traffic;
mod webview_opener;

use tauri::http::Response;
use tauri::Manager;

#[tauri::command]
fn toggle_devtools(window: tauri::Window) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let _window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "linux")]
            {
                _window.with_webview(|webview| {
                    use webkit2gtk::WebViewExt;
                    use webkit2gtk::SettingsExt;
                    if let Some(settings) = webview.inner().settings() {
                        settings.set_media_playback_requires_user_gesture(false);
                    }
                }).ok();
            }
            // Devtools available in all builds via F12 / Ctrl+Shift+I

            daemon_watcher::start(app.handle().clone());
            daemon_streaming::start(app.handle().clone());
            plugin_watcher::start(app.handle().clone());
            config_watcher::start(app.handle().clone());
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("hecate", |_ctx, request, responder| {
            std::thread::spawn(move || {
                let response = match socket_proxy::proxy_request(&request) {
                    Ok(resp) => resp,
                    Err(e) => {
                        let body = format!(r#"{{"ok":false,"error":"{}"}}"#, e);
                        Response::builder()
                            .status(503)
                            .header("Content-Type", "application/json")
                            .header("Access-Control-Allow-Origin", "*")
                            .body(body.into_bytes())
                            .unwrap()
                    }
                };
                responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![
            toggle_devtools,
            app_updater::check_app_update,
            app_updater::install_app_update,
            plugin_updater::check_plugin_updates,
            plugin_updater::install_plugin_update,
            plugin_streaming::plugin_sse_stream,
            traffic::get_traffic_counters,
            webview_opener::open_webview,
            webview_opener::close_webview,
            audio::list_audio_devices,
            audio::select_audio_device,
            audio::start_audio_recording,
            audio::stop_audio_recording,
            audio::get_audio_level,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
