mod daemon_watcher;
mod gladiator_streaming;
mod irc_streaming;
mod personality;
mod plugin_discovery;
mod snake_duel_streaming;
mod socket_proxy;
mod streaming;

use tauri::http::Response;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "linux")]
            {
                window.with_webview(|webview| {
                    use webkit2gtk::WebViewExt;
                    use webkit2gtk::SettingsExt;
                    if let Some(settings) = webview.inner().settings() {
                        settings.set_media_playback_requires_user_gesture(false);
                    }
                }).ok();
            }
            daemon_watcher::start(app.handle().clone());
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
            socket_proxy::check_daemon_health,
            plugin_discovery::discover_plugins,
            streaming::chat_stream,
            irc_streaming::irc_stream,
            snake_duel_streaming::snake_duel_stream,
            gladiator_streaming::gladiator_training_stream,
            personality::get_personality_info,
            personality::build_system_prompt,
            personality::list_roles,
            personality::load_agent_prompt,
            personality::load_agent_group,
            personality::load_raw_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
