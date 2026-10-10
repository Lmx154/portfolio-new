// Backend for the local CMS.
//
// - Generic local-filesystem commands (the frontend builds all content logic
//   on top of these + the dialog plugin + asset protocol).
// - A managed preview dev-server (spawns the *site's* Vite server so the CMS
//   can show the real website in an iframe).
// - Thin git commands for publishing content changes.
//
// Everything has full local fs access (single-user, local app); heavy content
// validation lives in the shared Zod schema on the frontend.

use serde::Serialize;
use std::fs;
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

#[derive(Serialize)]
struct DirEntry {
    name: String,
    is_dir: bool,
}

/// Holds the spawned preview dev-server process, if any.
#[derive(Default)]
struct PreviewState(Mutex<Option<Child>>);

/* ------------------------------------------------------------- filesystem */

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(DirEntry { name: entry.file_name().to_string_lossy().to_string(), is_dir });
    }
    Ok(out)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&dest).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&src, &dest).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_dir(path: String) -> Result<(), String> {
    fs::remove_dir_all(&path).map_err(|e| e.to_string())
}

/// Move/rename a file or directory. Refuses to overwrite an existing target so a
/// rename can never clobber another record; creates the parent dir if needed.
#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err(format!("{to} already exists"));
    }
    if let Some(parent) = Path::new(&to).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

/* ------------------------------------------------------ media library scan */

#[derive(Serialize)]
struct MediaFile {
    /// Path under public/, with forward slashes (e.g. "images/foo.webp").
    rel: String,
    bytes: u64,
}

/// Recursively list every file under `path` with its size (rel paths are
/// relative to `path`). Backs the asset library, which scans both the served
/// public/ folder and the models/ source folder.
#[tauri::command]
fn scan_dir(path: String) -> Result<Vec<MediaFile>, String> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<MediaFile>) -> std::io::Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let ft = entry.file_type()?;
            if ft.is_dir() {
                walk(&path, base, out)?;
            } else if ft.is_file() {
                let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
                out.push(MediaFile { rel, bytes });
            }
        }
        Ok(())
    }
    let base = Path::new(&path);
    let mut out = Vec::new();
    if base.exists() {
        walk(base, base, &mut out).map_err(|e| e.to_string())?;
    }
    out.sort_by(|a, b| a.rel.to_lowercase().cmp(&b.rel.to_lowercase()));
    Ok(out)
}

/// Of the given reference strings (e.g. "/images/foo.webp"), return those that
/// actually appear in a repo text file (content JSON, components, index.html).
/// Anything NOT returned is an orphan the media library can offer to delete.
#[tauri::command]
fn grep_refs(root: String, needles: Vec<String>) -> Result<Vec<String>, String> {
    const SKIP_DIRS: &[&str] = &["node_modules", "dist", ".git", "target", "cms", "public"];
    const TEXT_EXTS: &[&str] = &["json", "ts", "tsx", "js", "jsx", "mjs", "cjs", "html", "css", "md", "txt", "yaml", "yml"];
    fn walk(dir: &Path, needles: &[String], found: &mut std::collections::HashSet<String>) {
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            if found.len() == needles.len() {
                return; // every needle already located
            }
            let path = entry.path();
            let ft = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                walk(&path, needles, found);
            } else if ft.is_file() {
                let is_text = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| TEXT_EXTS.contains(&e.to_lowercase().as_str()))
                    .unwrap_or(true); // extensionless (e.g. _redirects) — try as text
                if !is_text {
                    continue;
                }
                if let Ok(text) = fs::read_to_string(&path) {
                    for n in needles {
                        if !found.contains(n) && text.contains(n.as_str()) {
                            found.insert(n.clone());
                        }
                    }
                }
            }
        }
    }
    let mut found = std::collections::HashSet::new();
    walk(Path::new(&root), &needles, &mut found);
    Ok(found.into_iter().collect())
}

/* ----------------------------------------------- media convert + compress */

fn has_tool(name: &str) -> bool {
    Command::new(name)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

fn ensure_parent(dest: &str) -> Result<(), String> {
    if let Some(p) = Path::new(dest).parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn run_tool(cmd: &str, args: &[&str], cwd: Option<&str>) -> Result<(), String> {
    let mut c = Command::new(cmd);
    c.args(args);
    if let Some(dir) = cwd {
        c.current_dir(dir);
    }
    let out = c.output().map_err(|e| format!("{cmd} could not run: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        let last = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("failed");
        Err(format!("{cmd}: {last}"))
    }
}

/// Which optional tools are present (ffmpeg for media, node for 3D conversion).
#[tauri::command]
fn check_tools() -> serde_json::Value {
    serde_json::json!({ "ffmpeg": has_tool("ffmpeg"), "node": has_tool("node") })
}

/// Compress + resize an image to WebP (max 1920px long edge).
#[tauri::command]
fn process_image(src: String, dest: String) -> Result<(), String> {
    ensure_parent(&dest)?;
    run_tool(
        "ffmpeg",
        &["-y", "-i", &src, "-vf", "scale='min(1920,iw)':-2", "-c:v", "libwebp", "-quality", "82", &dest],
        None,
    )
}

/// Crop a rectangle out of an image (source pixels) into a new WebP. Used by the
/// picker's crop tool so the stored file already matches its display shape.
#[tauri::command]
fn crop_image(src: String, dest: String, x: u32, y: u32, w: u32, h: u32) -> Result<(), String> {
    ensure_parent(&dest)?;
    let crop = format!("crop={w}:{h}:{x}:{y}");
    run_tool("ffmpeg", &["-y", "-i", &src, "-vf", &crop, "-c:v", "libwebp", "-quality", "90", &dest], None)
}

/// Transcode + compress a video to H.264 MP4 (max 1080p).
#[tauri::command]
fn process_video(src: String, dest: String) -> Result<(), String> {
    ensure_parent(&dest)?;
    run_tool(
        "ffmpeg",
        &[
            "-y", "-i", &src, "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-crf", "28",
            "-preset", "medium", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", &dest,
        ],
        None,
    )
}

/// Convert a 3D model (STEP/OBJ/GLB) to an optimized GLB via the repo's node script.
#[tauri::command]
fn convert_model(repo: String, src: String, dest: String) -> Result<(), String> {
    ensure_parent(&dest)?;
    let script = format!("{repo}/scripts/convert-model.mjs");
    run_tool("node", &["--max-old-space-size=4096", &script, &src, &dest], Some(&repo))
}

/* --------------------------------------------------------- preview server */

fn port_in_use(port: u16) -> bool {
    use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
    // Vite binds the loopback as IPv4 (127.0.0.1) or IPv6 (::1) depending on how
    // the OS resolves `localhost` — on Windows that's usually ::1 first, so an
    // IPv4-only probe never sees the server and the preview "does not come up in
    // time". Probe both families; the iframe loads via `localhost`, which the
    // webview will reach on whichever family Vite actually bound.
    let candidates = [
        SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
        SocketAddr::from((Ipv6Addr::LOCALHOST, port)),
    ];
    candidates
        .iter()
        .any(|addr| TcpStream::connect_timeout(addr, Duration::from_millis(250)).is_ok())
}

/// Surgically free a single TCP port. Only ever targets the specific processes
/// holding that port (never a process group / negative PID), so it cannot
/// cascade to the editor, the terminal session, or the login session.
#[cfg(not(windows))]
fn free_port(port: u16) {
    let _ = Command::new("fuser").arg("-k").arg(format!("{port}/tcp")).status();
    if let Ok(out) = Command::new("lsof").args(["-ti", &format!("tcp:{port}")]).output() {
        for pid in String::from_utf8_lossy(&out.stdout).split_whitespace() {
            // A specific positive PID only — no negative/group targets.
            let _ = Command::new("kill").arg("-TERM").arg(pid).status();
        }
    }
}

/// Windows equivalent of the above: resolve the PID(s) whose *local* endpoint is
/// this exact port via `netstat -ano`, then `taskkill` them. Still port-scoped —
/// it only targets processes bound to `port`, never a process group.
#[cfg(windows)]
fn free_port(port: u16) {
    if let Ok(out) = Command::new("netstat").args(["-ano", "-p", "tcp"]).output() {
        let text = String::from_utf8_lossy(&out.stdout);
        let needle = format!(":{port}");
        let mut pids = std::collections::HashSet::new();
        for line in text.lines() {
            // Columns: Proto  Local Address  Foreign Address  State  PID
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() >= 5 && cols[0].eq_ignore_ascii_case("tcp") && cols[1].ends_with(needle.as_str()) {
                if let Ok(pid) = cols[cols.len() - 1].parse::<u32>() {
                    if pid != 0 {
                        pids.insert(pid);
                    }
                }
            }
        }
        for pid in pids {
            let _ = Command::new("taskkill").args(["/F", "/PID"]).arg(pid.to_string()).status();
        }
    }
}

#[tauri::command]
fn preview_status(port: u16) -> bool {
    port_in_use(port)
}

#[tauri::command]
fn start_preview(state: tauri::State<PreviewState>, root: String, port: u16) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() || port_in_use(port) {
        return Ok(()); // already running
    }
    // Launch Vite via `node <vite.js>` rather than the launcher in
    // node_modules/.bin. On Windows that .bin entry is a POSIX shell script (and
    // the .cmd sibling is a batch file) — neither is a PE executable, so spawning
    // it directly fails with "%1 is not a valid Win32 application" (os error 193).
    // Invoking node with the package's JS entry point is correct on every OS.
    let vite_js = format!("{root}/node_modules/vite/bin/vite.js");
    if !Path::new(&vite_js).exists() {
        return Err("Could not find node_modules/vite/bin/vite.js in the repo — run `pnpm install` there first.".into());
    }
    let mut cmd = Command::new("node");
    cmd.current_dir(&root)
        .arg(&vite_js)
        .args(["--port", &port.to_string(), "--strictPort"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // Note: the child stays in our session so it dies on Ctrl+C; we stop it
    // surgically by PID + port (never a group kill — see free_port).
    let child = cmd.spawn().map_err(|e| format!("Failed to start dev server: {e}"))?;
    *guard = Some(child);
    Ok(())
}

/// Stop the preview. Returns true only if the port is actually free afterwards,
/// so the UI keeps the switch ON (and offers Kill port) when shutdown fails.
#[tauri::command]
fn stop_preview(state: tauri::State<PreviewState>, port: u16) -> Result<bool, String> {
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill(); // specific child PID only
            let _ = child.wait();
        }
    }
    free_port(port); // clean up any straggler holding the port (e.g. esbuild)
    std::thread::sleep(Duration::from_millis(500));
    Ok(!port_in_use(port))
}

/// Forcefully free the port (fallback for the UI). Port-scoped — safe.
#[tauri::command]
fn kill_port(port: u16) -> Result<(), String> {
    free_port(port);
    std::thread::sleep(Duration::from_millis(300));
    if port_in_use(port) {
        Err("Could not free the port — nothing was listening, or the OS tool to free it is unavailable.".into())
    } else {
        Ok(())
    }
}

/* ------------------------------------------------------------------- git */

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git").current_dir(root).args(args).output().map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string();
    if out.status.success() {
        Ok(text)
    } else {
        Err(text)
    }
}

#[tauri::command]
fn git_status(root: String) -> Result<serde_json::Value, String> {
    let branch = run_git(&root, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let porcelain = run_git(&root, &["status", "--porcelain"])?;
    let changes: Vec<String> = porcelain.lines().filter(|l| !l.trim().is_empty()).map(|l| l.to_string()).collect();
    Ok(serde_json::json!({
        "branch": branch,
        "changes": changes,
        "clean": changes.is_empty(),
    }))
}

#[tauri::command]
fn git_commit(root: String, message: String) -> Result<String, String> {
    // Never stage files that still contain conflict markers.
    let unmerged = unmerged_files(&root);
    if !unmerged.is_empty() {
        return Err(format!("A merge is still in progress ({}). Finish or cancel it before publishing.", unmerged.join(", ")));
    }
    run_git(&root, &["add", "-A"])?;
    let out = Command::new("git")
        .current_dir(&root)
        .args(["commit", "-m", &message])
        .output()
        .map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string();
    if out.status.success() {
        Ok(text)
    } else if text.contains("nothing to commit") {
        Ok("Nothing to commit — working tree clean.".into())
    } else {
        Err(text)
    }
}

#[tauri::command]
fn git_push(root: String) -> Result<String, String> {
    match run_git(&root, &["push"]) {
        Ok(s) => Ok(if s.is_empty() { "Pushed.".into() } else { s }),
        Err(e) if e.contains("no upstream") || e.contains("has no upstream") => {
            run_git(&root, &["push", "origin", "HEAD"])
        }
        Err(e) => Err(e),
    }
}

/* ---------------------------------------------------------- git: safe sync */

/// Download the remote's latest commits without touching the working tree.
#[tauri::command]
fn git_fetch(root: String) -> Result<String, String> {
    match run_git(&root, &["fetch", "--prune", "origin"]) {
        Ok(s) => Ok(if s.is_empty() { "Up to date.".into() } else { s }),
        Err(e) if e.contains("does not appear to be a git repository") || e.contains("No such remote") => {
            run_git(&root, &["fetch", "--prune"])
        }
        Err(e) => Err(e),
    }
}

fn has_upstream(root: &str) -> bool {
    run_git(root, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).is_ok()
}

/// Files git left in a conflicted (unmerged) state.
fn unmerged_files(root: &str) -> Vec<String> {
    run_git(root, &["diff", "--name-only", "--diff-filter=U"])
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// Branch, upstream tracking, ahead/behind counts, cleanliness, and any files
/// currently in a conflicted merge — everything the Publish tab needs to decide
/// whether a plain push is safe or a merge is required first.
#[tauri::command]
fn git_sync_status(root: String) -> Result<serde_json::Value, String> {
    let branch = run_git(&root, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let porcelain = run_git(&root, &["status", "--porcelain"]).unwrap_or_default();
    let clean = porcelain.lines().all(|l| l.trim().is_empty());
    let upstream = has_upstream(&root);
    let (mut ahead, mut behind) = (0i64, 0i64);
    if upstream {
        if let Ok(counts) = run_git(&root, &["rev-list", "--left-right", "--count", "@{u}...HEAD"]) {
            let mut it = counts.split_whitespace();
            behind = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
            ahead = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        }
    }
    let conflicted = unmerged_files(&root);
    let merging = run_git(&root, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_ok();
    Ok(serde_json::json!({
        "branch": branch,
        "hasUpstream": upstream,
        "ahead": ahead,
        "behind": behind,
        "clean": clean,
        "conflicted": conflicted,
        "merging": merging,
    }))
}

/// Merge the upstream tracking branch into the working tree. Because content is
/// split into many small JSON files, this auto-merges cleanly the vast majority
/// of the time. On a real conflict git leaves the merge in progress and we
/// return the conflicted files so the UI can walk the user through resolving
/// them — the push never happens until the merge is finished.
#[tauri::command]
fn git_merge_remote(root: String) -> Result<serde_json::Value, String> {
    if !has_upstream(&root) {
        return Ok(serde_json::json!({ "ok": true, "conflicted": [], "output": "No upstream branch yet." }));
    }
    let out = Command::new("git")
        .current_dir(&root)
        .args(["merge", "--no-edit", "@{u}"])
        .output()
        .map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string();
    let conflicted = unmerged_files(&root);
    if out.status.success() {
        Ok(serde_json::json!({ "ok": true, "conflicted": [], "output": text }))
    } else if !conflicted.is_empty() {
        Ok(serde_json::json!({ "ok": false, "conflicted": conflicted, "output": text }))
    } else {
        Err(text)
    }
}

/// The three sides of a conflicted file: `base` (common ancestor, may be empty
/// for an add/add conflict), `ours` (this editor's version) and `theirs` (what
/// another computer pushed). Read straight from git's merge stages. Also reports
/// per side whether the file exists there (`oursExists`/`theirsExists`, false =
/// that side deleted it) and whether it is binary (`binary`), in which case the
/// text fields are left empty.
#[tauri::command]
fn git_conflict_versions(root: String, file: String) -> Result<serde_json::Value, String> {
    let raw = |stage: u8| -> Option<Vec<u8>> {
        let spec = format!(":{}:{}", stage, file);
        let out = Command::new("git").current_dir(&root).args(["show", &spec]).output().ok()?;
        if out.status.success() { Some(out.stdout) } else { None }
    };
    let (base, ours, theirs) = (raw(1), raw(2), raw(3));
    let ext_text = {
        let lower = file.to_lowercase();
        lower.ends_with(".json") || lower.ends_with(".md") || lower.ends_with(".txt")
    };
    let is_bin = |b: &Option<Vec<u8>>| match b {
        Some(v) => v.contains(&0) || std::str::from_utf8(v).is_err(),
        None => false,
    };
    let binary = !ext_text || is_bin(&base) || is_bin(&ours) || is_bin(&theirs);
    let text = |b: &Option<Vec<u8>>| -> String {
        if binary { String::new() } else { b.as_ref().map(|v| String::from_utf8_lossy(v).to_string()).unwrap_or_default() }
    };
    Ok(serde_json::json!({
        "file": file,
        "base": text(&base),
        "ours": text(&ours),
        "theirs": text(&theirs),
        "oursExists": ours.is_some(),
        "theirsExists": theirs.is_some(),
        "binary": binary,
    }))
}

/// Resolve a conflicted file by taking one whole side. If that side has the file
/// it is checked out and staged byte-for-byte (safe for binary files); if that
/// side deleted it, the file is removed. `side` is "ours" (this computer) or
/// "theirs" (the other computer).
#[tauri::command]
fn git_resolve_side(root: String, file: String, side: String) -> Result<(), String> {
    let rel = Path::new(&file);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("Refusing to write outside the repo: {}", file));
    }
    let (flag, stage) = match side.as_str() {
        "ours" => ("--ours", "2"),
        "theirs" => ("--theirs", "3"),
        _ => return Err(format!("Unknown side: {}", side)),
    };
    let staged = run_git(&root, &["ls-files", "-u", "--", &file])?;
    let has_side = staged.lines().any(|l| {
        l.split('\t').next().and_then(|m| m.split_whitespace().nth(2)) == Some(stage)
    });
    if has_side {
        run_git(&root, &["checkout", flag, "--", &file])?;
        run_git(&root, &["add", "--", &file])?;
    } else {
        run_git(&root, &["rm", "-f", "--", &file])?;
    }
    Ok(())
}

/// Write the final merged contents for a conflicted file and stage it (git add),
/// marking that file resolved.
#[tauri::command]
fn git_resolve_file(root: String, file: String, contents: String) -> Result<(), String> {
    let rel = Path::new(&file);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("Refusing to write outside the repo: {}", file));
    }
    let path = Path::new(&root).join(rel);
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    run_git(&root, &["add", "--", &file])?;
    Ok(())
}

/// Finish a merge once every conflict is resolved by committing it.
#[tauri::command]
fn git_merge_continue(root: String) -> Result<serde_json::Value, String> {
    let unmerged = unmerged_files(&root);
    if !unmerged.is_empty() {
        return Ok(serde_json::json!({ "ok": false, "conflicted": unmerged }));
    }
    let out = Command::new("git")
        .current_dir(&root)
        .args(["commit", "--no-edit"])
        .output()
        .map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string();
    if out.status.success() || text.contains("nothing to commit") {
        Ok(serde_json::json!({ "ok": true, "output": text }))
    } else {
        Err(text)
    }
}

/// Bail out of an in-progress merge, restoring the pre-merge state. The editor's
/// own work stays intact (it was committed before the merge) and nothing was
/// pushed.
#[tauri::command]
fn git_merge_abort(root: String) -> Result<String, String> {
    run_git(&root, &["merge", "--abort"]).map(|_| "Merge canceled — your changes are safe.".into())
}

/* ------------------------------------------------------------ git: history */

/// Recent *content* commits for the "undo a change" list. Merge commits are
/// skipped: they're plumbing (meaningless to an editor) and can't be reverted
/// without extra flags — so every row shown here is a real change that undoes
/// cleanly.
#[tauri::command]
fn git_log(root: String, count: u32) -> Result<serde_json::Value, String> {
    let n = format!("-{}", count.max(1));
    // Content commits only: the CMS must never offer to undo site-code commits.
    let out = run_git(&root, &["log", "--no-merges", &n, "--pretty=format:%H%x1f%an%x1f%ar%x1f%s", "--", "src/content", "public"])?;
    let commits: Vec<serde_json::Value> = out
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let mut p = line.split('\u{1f}');
            serde_json::json!({
                "hash": p.next().unwrap_or(""),
                "author": p.next().unwrap_or(""),
                "when": p.next().unwrap_or(""),
                "subject": p.next().unwrap_or(""),
            })
        })
        .collect();
    Ok(serde_json::json!(commits))
}

/// Undo a previous commit by creating a new commit that reverses it. This never
/// rewrites history, so it's safe to push and never destroys work from another computer.
/// If the same content was changed again afterwards the revert can't apply
/// cleanly — we abort and say so rather than leave a mess.
#[tauri::command]
fn git_revert(root: String, hash: String) -> Result<serde_json::Value, String> {
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Not a commit hash: {}", hash));
    }
    let dirty = run_git(&root, &["status", "--porcelain"])?;
    if dirty.lines().any(|l| !l.trim().is_empty()) {
        return Err("You have unpublished changes — publish them first, then undo.".into());
    }
    let out = Command::new("git")
        .current_dir(&root)
        .args(["revert", "--no-edit", &hash])
        .output()
        .map_err(|e| e.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string();
    if out.status.success() {
        Ok(serde_json::json!({ "ok": true, "output": text }))
    } else {
        let _ = run_git(&root, &["revert", "--abort"]);
        let files: Vec<&str> = text
            .lines()
            .filter_map(|l| l.strip_prefix("CONFLICT").and_then(|r| r.rsplit(" in ").next()))
            .collect();
        let detail = if files.is_empty() { text.lines().next().unwrap_or("").to_string() } else { files.join(", ") };
        Err(format!(
            "Couldn't automatically undo that change — that content was edited again afterwards, so it needs a manual fix. Nothing was changed. ({})",
            detail
        ))
    }
}

/* ------------------------------------------------------------------ ollama */

/// Proxy a chat request to the local Ollama server. Runs server-to-server from
/// Rust so there are no browser CORS issues, and keeps to plain http on
/// localhost. `messages` is the OpenAI-style [{role, content}] array.
#[tauri::command]
async fn ollama_chat(base: String, model: String, messages: serde_json::Value) -> Result<String, String> {
    let url = format!("{}/api/chat", base.trim_end_matches('/'));
    let body = serde_json::json!({ "model": model, "messages": messages, "stream": false });
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Ollama at {} — is it running? ({})", base, e))?;
    let status = resp.status();
    let val: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ollama sent a response we couldn't read ({})", e))?;
    if !status.is_success() {
        let msg = val.get("error").and_then(|e| e.as_str()).unwrap_or("Ollama returned an error");
        return Err(msg.to_string());
    }
    Ok(val
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string())
}

/// List the models the local Ollama server has pulled, for the model picker.
#[tauri::command]
async fn ollama_models(base: String) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", base.trim_end_matches('/'));
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Ollama at {} — is it running? ({})", base, e))?;
    let val: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = val
        .get("models")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    Ok(models)
}

/* ------------------------------------------------------------------- run */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PreviewState::default())
        .invoke_handler(tauri::generate_handler![
            path_exists,
            list_dir,
            read_text_file,
            write_text_file,
            copy_file,
            remove_file,
            remove_dir,
            rename_path,
            scan_dir,
            grep_refs,
            check_tools,
            process_image,
            crop_image,
            process_video,
            convert_model,
            preview_status,
            start_preview,
            stop_preview,
            kill_port,
            git_status,
            git_commit,
            git_push,
            git_fetch,
            git_sync_status,
            git_merge_remote,
            git_conflict_versions,
            git_resolve_file,
            git_resolve_side,
            git_merge_continue,
            git_merge_abort,
            git_log,
            git_revert,
            ollama_chat,
            ollama_models
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|handle, event| {
            // Don't leave an orphaned dev server when the app quits.
            if let tauri::RunEvent::Exit = event {
                let child = handle.state::<PreviewState>().0.lock().ok().and_then(|mut g| g.take());
                if let Some(mut child) = child {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
