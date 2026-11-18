#[tauri::command]
fn print_receipt(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|_| "The Windows print dialog could not be opened.".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![print_receipt])
        .run(tauri::generate_context!())
        .expect("Golden Rose Perfume could not start");
}
