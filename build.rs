use std::fs;
use std::path::Path;

fn main() {
    // Ensure web/dist/index.html exists so that include_str! doesn't fail at compile time.
    let dest_dir = Path::new("web/dist");
    if !dest_dir.exists() {
        let _ = fs::create_dir_all(dest_dir);
    }
    let index_path = dest_dir.join("index.html");
    if !index_path.exists() {
        let _ = fs::write(
            index_path,
            "<!DOCTYPE html><html><body><h1>Front-end not built. Run npm run build in web/ directory.</h1></body></html>",
        );
    }
}
