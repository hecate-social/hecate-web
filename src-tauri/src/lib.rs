mod personality;
mod socket_proxy;
mod streaming;

use tauri::http::Response;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            streaming::chat_stream,
            personality::get_personality_info,
            personality::build_system_prompt,
            personality::list_roles,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
