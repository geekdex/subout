use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=web/src");
    println!("cargo:rerun-if-changed=web/package.json");
    println!("cargo:rerun-if-changed=web/dist/index.html");
    println!("cargo:rerun-if-changed=build.rs");

    let dest_dir = Path::new("web/dist");
    if !dest_dir.exists() {
        let _ = fs::create_dir_all(dest_dir);
    }
    let index_path = dest_dir.join("index.html");

    // Try building the frontend if pnpm / npm is available and web/package.json exists
    let web_dir = Path::new("web");
    if web_dir.join("package.json").exists() {
        let should_build = !index_path.exists() || is_web_src_newer(&index_path);
        if should_build {
            let pnpm_cmd = if cfg!(target_os = "windows") { "pnpm.cmd" } else { "pnpm" };
            let npm_cmd = if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" };

            // Install dependencies if node_modules is missing
            if !web_dir.join("node_modules").exists() {
                let _ = Command::new(pnpm_cmd)
                    .current_dir("web")
                    .arg("install")
                    .status()
                    .or_else(|_| {
                        Command::new(npm_cmd)
                            .current_dir("web")
                            .arg("install")
                            .status()
                    });
            }

            // Try building with pnpm first, then fallback to npm
            let status = Command::new(pnpm_cmd)
                .current_dir("web")
                .arg("run")
                .arg("build")
                .status()
                .or_else(|_| {
                    Command::new(npm_cmd)
                        .current_dir("web")
                        .arg("run")
                        .arg("build")
                        .status()
                });
            if status.map(|s| s.success()).unwrap_or(false) {
                let mod_path = Path::new("src/web/mod.rs");
                if mod_path.exists() {
                    let _ = fs::copy(mod_path, "src/web/mod.rs.tmp");
                    let _ = fs::rename("src/web/mod.rs.tmp", mod_path);
                }
            }
        }
    }

    if !index_path.exists() {
        let _ = fs::write(
            &index_path,
            "<!DOCTYPE html><html><body><h1>Front-end not built. Run npm run build in web/ directory.</h1></body></html>",
        );
    }
}

fn check_dir_newer(dir: &Path, dist_time: std::time::SystemTime) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if check_dir_newer(&path, dist_time) {
                    return true;
                }
            } else if let Ok(meta) = entry.metadata() {
                if let Ok(mod_time) = meta.modified() {
                    if mod_time > dist_time {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn is_web_src_newer(dist_index: &Path) -> bool {
    let Ok(dist_meta) = dist_index.metadata() else {
        return true;
    };
    let Ok(dist_time) = dist_meta.modified() else {
        return true;
    };

    check_dir_newer(Path::new("web/src"), dist_time)
}
