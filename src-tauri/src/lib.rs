use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::VecDeque;
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive};

static EXPORT_PROCESS_ID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgressPayload {
    label: String,
    percent: u8,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerPayload {
    id: String,
    name: String,
    visible: bool,
    color_ids: [String; 2],
    z_depth: u8,
    pixels: Vec<u8>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPayload {
    width: u32,
    height: u32,
    #[serde(default = "default_project_fps")]
    fps: f64,
    background_color_id: String,
    active_layer_id: String,
    current_page_index: usize,
    frames: Vec<FramePayload>,
    #[serde(default)]
    audio_materials: Vec<AudioFilePayload>,
    #[serde(default)]
    recordings: Vec<AudioFilePayload>,
    #[serde(default)]
    timeline_clips: Vec<TimelineClipPayload>,
    #[serde(default)]
    audio_assets: std::collections::HashMap<String, AudioAssetPayload>,
    #[serde(default)]
    audio_tracks: Vec<AudioTrackPayload>,
    #[serde(default)]
    brush_assets: Vec<ProjectBrushAssetPayload>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FramePayload {
    id: String,
    layers: Vec<LayerPayload>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFilePayload {
    id: String,
    name: String,
    path: String,
    extension: String,
    #[serde(default)]
    duration_ms: u64,
    #[serde(default)]
    waveform_summary: Vec<f32>,
    #[serde(default)]
    is_offline: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAssetPayload {
    id: String,
    name: String,
    original_path: String,
    duration_ms: u64,
    waveform_summary: Vec<f32>,
    extension: String,
    #[serde(default)]
    is_offline: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioClipPayload {
    id: String,
    asset_id: String,
    start_frame: f64,
    duration_frames: f64,
    source_offset_ms: u64,
    volume: f32,
    playback_rate: f32,
    #[serde(default)]
    is_offline: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrackPayload {
    id: String,
    name: String,
    volume: f32,
    is_muted: bool,
    is_solo: bool,
    clips: Vec<AudioClipPayload>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineClipPayload {
    id: String,
    source_id: String,
    source_type: String,
    name: String,
    track_index: usize,
    start_frame: f64,
    duration_frames: f64,
    #[serde(default)]
    source_offset_frames: f64,
    loop_count: usize,
    reversed: bool,
    #[serde(default = "default_clip_volume")]
    volume: f32,
    #[serde(default)]
    panning: f32,
    #[serde(default)]
    fade_in_frames: f64,
    #[serde(default)]
    fade_out_frames: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomBrushTipPayload {
    id: String,
    name: String,
    source_type: String,
    stored_file_path: String,
    imported_at: String,
    #[serde(default = "default_brush_tip_mask_source_mode")]
    mask_source_mode: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBrushAssetPayload {
    id: String,
    name: String,
    #[serde(default)]
    path: String,
    kind: String,
    source: String,
    #[serde(default)]
    stored_file_path: String,
    #[serde(default = "default_brush_tip_mask_source_mode")]
    mask_source_mode: String,
    #[serde(default = "default_brush_tip_smoothing")]
    smoothing: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrushPresetPayload {
    id: String,
    name: String,
    tip_id: String,
    size: u32,
    spacing: f64,
    scatter: f64,
    rotation_mode: String,
    rotation_degrees: f64,
    rotation_jitter_degrees: f64,
    scale_jitter: f64,
    #[serde(default = "default_brush_tip_smoothing")]
    smoothing: String,
    #[serde(default = "default_brush_tip_mask_source_mode")]
    mask_source_mode: String,
    source: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct ProjectMetadata {
    format: String,
    version: u32,
    width: u32,
    height: u32,
    #[serde(default = "default_project_fps")]
    fps: f64,
    background_color_id: String,
    active_layer_id: String,
    current_page_index: usize,
    frames: Vec<FrameMetadata>,
    #[serde(default)]
    audio_materials: Vec<AudioFilePayload>,
    #[serde(default)]
    recordings: Vec<AudioFilePayload>,
    #[serde(default)]
    timeline_clips: Vec<TimelineClipPayload>,
    #[serde(default)]
    audio_assets: std::collections::HashMap<String, AudioAssetPayload>,
    #[serde(default)]
    audio_tracks: Vec<AudioTrackPayload>,
    #[serde(default)]
    brush_assets: Vec<ProjectBrushAssetMetadata>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBrushAssetMetadata {
    id: String,
    name: String,
    path: String,
    kind: String,
    source: String,
    #[serde(default = "default_brush_tip_mask_source_mode")]
    mask_source_mode: String,
    #[serde(default = "default_brush_tip_smoothing")]
    smoothing: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct FrameMetadata {
    id: String,
    layers: Vec<LayerMetadata>,
}

#[derive(Debug, Deserialize, Serialize)]
struct LayerMetadata {
    id: String,
    name: String,
    visible: bool,
    color_ids: [String; 2],
    z_depth: u8,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSaveResult {
    project_name: String,
    project_path: String,
    image_dir: String,
    movie_dir: String,
    record_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectLoadResult {
    project_name: String,
    project_path: String,
    image_dir: String,
    movie_dir: String,
    record_dir: String,
    project: ProjectPayload,
}

#[tauri::command]
fn encode_layer_png(width: u32, height: u32, pixels: Vec<u8>) -> Result<Vec<u8>, String> {
    encode_png(width, height, &pixels)
}

#[tauri::command]
fn flood_fill(
    width: u32,
    height: u32,
    pixels: Vec<u8>,
    start_x: u32,
    start_y: u32,
    fill_color: [u8; 4],
) -> Result<Vec<u8>, String> {
    let width_usize = width as usize;
    let height_usize = height as usize;
    let expected_len = width_usize
        .checked_mul(height_usize)
        .and_then(|pixel_count| pixel_count.checked_mul(4))
        .ok_or_else(|| "Image dimensions are too large.".to_string())?;

    if width == 0 || height == 0 {
        return Err("Image dimensions must be greater than zero.".to_string());
    }

    if pixels.len() != expected_len {
        return Err(format!(
            "Invalid RGBA buffer length: got {}, expected {}.",
            pixels.len(),
            expected_len
        ));
    }

    if start_x >= width || start_y >= height {
        return Err("Flood fill start point is outside the image.".to_string());
    }

    let mut output = pixels;
    let start_index = pixel_index(start_x as usize, start_y as usize, width_usize);
    let target_color = [
        output[start_index],
        output[start_index + 1],
        output[start_index + 2],
        output[start_index + 3],
    ];

    if target_color == fill_color {
        return Ok(output);
    }

    let mut queue = VecDeque::from([(start_x as usize, start_y as usize)]);

    while let Some((x, y)) = queue.pop_front() {
        let index = pixel_index(x, y, width_usize);
        if !pixel_matches(&output, index, target_color) {
            continue;
        }

        output[index] = fill_color[0];
        output[index + 1] = fill_color[1];
        output[index + 2] = fill_color[2];
        output[index + 3] = fill_color[3];

        if x > 0 {
            queue.push_back((x - 1, y));
        }
        if x + 1 < width_usize {
            queue.push_back((x + 1, y));
        }
        if y > 0 {
            queue.push_back((x, y - 1));
        }
        if y + 1 < height_usize {
            queue.push_back((x, y + 1));
        }
    }

    Ok(output)
}

#[tauri::command]
fn save_upj_project(path: String, project: ProjectPayload) -> Result<(), String> {
    write_project_file(Path::new(&path), &project)
}

#[tauri::command]
fn default_project_package_paths(project_name: String) -> Result<ProjectSaveResult, String> {
    let project_name = sanitize_project_name(&project_name);
    let documents = documents_dir()?;
    Ok(project_package_paths(&documents, &project_name))
}

#[tauri::command]
fn default_project_save_dialog_path(project_name: String) -> Result<String, String> {
    let project_name = sanitize_project_name(&project_name);
    let project_root = documents_dir()?.join("Project Ugomemo");
    fs::create_dir_all(&project_root).map_err(|error| error.to_string())?;

    Ok(project_root
        .join(format!("{project_name}.upj"))
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
fn save_project_package(
    selected_path: String,
    project: ProjectPayload,
) -> Result<ProjectSaveResult, String> {
    let selected_path = ensure_upj_extension(PathBuf::from(selected_path));
    let project_name = sanitize_project_name(&project_name_from_path(&selected_path));
    let paths = project_package_paths_from_selected_path(&selected_path, &project_name)?;

    fs::create_dir_all(&paths.image_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&paths.movie_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&paths.record_dir).map_err(|error| error.to_string())?;
    write_project_file(Path::new(&paths.project_path), &project)?;

    Ok(paths)
}

#[tauri::command]
fn load_project_package(
    app: tauri::AppHandle,
    selected_path: String,
) -> Result<ProjectLoadResult, String> {
    let selected_path = PathBuf::from(selected_path);
    let file = File::open(&selected_path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    let metadata_json = read_zip_text(&mut archive, "metadata.json")?;
    let metadata: ProjectMetadata =
        serde_json::from_str(&metadata_json).map_err(|error| error.to_string())?;

    if metadata.format != "project-ugomemo" {
        return Err("Unsupported project file format.".to_string());
    }

    let frames = metadata
        .frames
        .iter()
        .map(|frame| {
            let layers = frame
                .layers
                .iter()
                .map(|layer| {
                    let png_bytes = read_zip_bytes(&mut archive, &layer.path)?;
                    let pixels = decode_png_rgba(metadata.width, metadata.height, &png_bytes)?;
                    Ok(LayerPayload {
                        id: layer.id.to_string(),
                        name: layer.name.to_string(),
                        visible: layer.visible,
                        color_ids: layer.color_ids.clone(),
                        z_depth: layer.z_depth,
                        pixels,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;

            Ok(FramePayload {
                id: frame.id.to_string(),
                layers,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let brush_assets =
        load_project_brush_assets(&app, &selected_path, &mut archive, &metadata.brush_assets)?;

    let project = ProjectPayload {
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        background_color_id: metadata.background_color_id.to_string(),
        active_layer_id: metadata.active_layer_id.to_string(),
        current_page_index: metadata.current_page_index,
        frames,
        audio_materials: metadata.audio_materials.clone(),
        recordings: metadata.recordings.clone(),
        timeline_clips: metadata.timeline_clips.clone(),
        audio_assets: metadata.audio_assets.clone(),
        audio_tracks: metadata.audio_tracks.clone(),
        brush_assets,
    };

    validate_project(&project)?;

    let project_name = selected_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_project_name)
        .unwrap_or_else(|| "untitled_project".to_string());
    let project_dir = selected_path.parent().unwrap_or_else(|| Path::new(""));

    Ok(ProjectLoadResult {
        project_name,
        project_path: selected_path.to_string_lossy().to_string(),
        image_dir: project_dir.join("image").to_string_lossy().to_string(),
        movie_dir: project_dir.join("movie").to_string_lossy().to_string(),
        record_dir: project_dir.join("record").to_string_lossy().to_string(),
        project,
    })
}

#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<String, String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn copy_file(source_path: String, target_path: String) -> Result<String, String> {
    let target_path = PathBuf::from(target_path);
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(source_path, &target_path).map_err(|error| error.to_string())?;
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn encode_wav_to_mp3_file(path: String, wav_bytes: Vec<u8>) -> Result<String, String> {
    let output_path = PathBuf::from(path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let temp_name = format!(
        "project_ugomemo_recording_{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos()
    );
    let temp_path = std::env::temp_dir().join(temp_name);
    fs::write(&temp_path, wav_bytes).map_err(|error| error.to_string())?;

    let output = Command::new(ffmpeg_cmd())
        .arg("-y")
        .arg("-v")
        .arg("error")
        .arg("-i")
        .arg(&temp_path)
        .arg("-codec:a")
        .arg("libmp3lame")
        .arg("-q:a")
        .arg("2")
        .arg(&output_path)
        .output()
        .map_err(|error| format!("Could not run ffmpeg: {error}"));

    let _ = fs::remove_file(&temp_path);

    let output = output?;
    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        return Err(format!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn rename_file(path: String, new_name: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot rename a file without a parent directory.".to_string())?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let safe_stem = sanitize_project_name(&new_name);
    let next_path = parent.join(format!("{safe_stem}{extension}"));
    fs::rename(&path, &next_path).map_err(|error| error.to_string())?;
    Ok(next_path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_custom_brush_tips(app: tauri::AppHandle) -> Result<Vec<CustomBrushTipPayload>, String> {
    read_custom_brush_library(&app)
}

#[tauri::command]
fn load_custom_brush_presets(app: tauri::AppHandle) -> Result<Vec<BrushPresetPayload>, String> {
    read_custom_brush_presets(&app)
}

#[tauri::command]
fn save_custom_brush_presets(
    app: tauri::AppHandle,
    presets: Vec<BrushPresetPayload>,
) -> Result<(), String> {
    write_custom_brush_presets(&app, &presets)
}

#[tauri::command]
fn import_custom_brush_tip(
    app: tauri::AppHandle,
    selected_path: String,
) -> Result<CustomBrushTipPayload, String> {
    let source_path = PathBuf::from(&selected_path);
    if !source_path.is_file() {
        return Err("Selected brush tip file does not exist.".to_string());
    }

    image::ImageReader::open(&source_path)
        .map_err(|error| format!("Could not open brush tip image: {error}"))?
        .with_guessed_format()
        .map_err(|error| format!("Could not inspect brush tip image: {error}"))?
        .decode()
        .map_err(|error| format!("Selected file is not a loadable image: {error}"))?;

    let bytes = fs::read(&source_path).map_err(|error| error.to_string())?;
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    let content_hash = hasher.finish();
    let imported_at_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "png".to_string());
    let source_name = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_project_name)
        .unwrap_or_else(|| "custom_brush".to_string());
    let asset_dir = custom_brush_asset_dir(&app)?;
    fs::create_dir_all(&asset_dir).map_err(|error| error.to_string())?;
    let file_name = format!("{source_name}_{imported_at_millis}_{content_hash:016x}.{extension}");
    let stored_path = asset_dir.join(file_name);
    fs::write(&stored_path, bytes).map_err(|error| error.to_string())?;

    let tip = CustomBrushTipPayload {
        id: format!("custom:{imported_at_millis:x}:{content_hash:016x}"),
        name: source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|| "Custom Brush".to_string()),
        source_type: "custom".to_string(),
        stored_file_path: stored_path.to_string_lossy().to_string(),
        imported_at: imported_at_millis.to_string(),
        mask_source_mode: default_brush_tip_mask_source_mode(),
    };

    let mut library = read_custom_brush_library(&app)?;
    library.push(tip.clone());
    write_custom_brush_library(&app, &library)?;
    Ok(tip)
}

#[tauri::command]
fn inspect_audio_files(paths: Vec<String>) -> Result<Vec<AudioFilePayload>, String> {
    paths
        .iter()
        .map(|path| {
            let path_buf = PathBuf::from(path);
            let file_name = path_buf
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(path);
            let extension = path_buf
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| format!(".{}", value.to_ascii_lowercase()))
                .unwrap_or_default();
            let name = file_name
                .strip_suffix(&extension)
                .unwrap_or(file_name)
                .to_string();

            Ok(AudioFilePayload {
                id: format!(
                    "{}-{}",
                    path,
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(|error| error.to_string())?
                        .as_nanos()
                ),
                name,
                path: path.to_string(),
                extension,
                duration_ms: probe_audio_duration_ms(path).unwrap_or(0),
                waveform_summary: summarize_audio_file_bytes(&path_buf).unwrap_or_default(),
                is_offline: !path_buf.exists(),
            })
        })
        .collect()
}

#[tauri::command]
fn validate_audio_assets(
    project_path: Option<String>,
    assets: std::collections::HashMap<String, AudioAssetPayload>,
) -> Result<std::collections::HashMap<String, AudioAssetPayload>, String> {
    let base_dir = project_path
        .as_ref()
        .and_then(|path| Path::new(path).parent())
        .map(Path::to_path_buf);

    Ok(assets
        .into_iter()
        .map(|(id, mut asset)| {
            let resolved = resolve_asset_path(base_dir.as_deref(), &asset.original_path);
            asset.is_offline = !resolved.exists();
            (id, asset)
        })
        .collect())
}

#[tauri::command]
fn bundle_project_assets(
    project_path: String,
    assets: std::collections::HashMap<String, AudioAssetPayload>,
) -> Result<std::collections::HashMap<String, AudioAssetPayload>, String> {
    let project_path = PathBuf::from(project_path);
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Project path has no parent directory.".to_string())?;
    let assets_dir = project_dir.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|error| error.to_string())?;

    let mut bundled = std::collections::HashMap::new();
    for (id, mut asset) in assets {
        let source = resolve_asset_path(Some(project_dir), &asset.original_path);
        if !source.exists() {
            asset.is_offline = true;
            bundled.insert(id, asset);
            continue;
        }

        let file_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("audio_asset");
        let target_name = format!("{}_{}", sanitize_project_name(&asset.id), file_name);
        let target_path = assets_dir.join(target_name);
        fs::copy(&source, &target_path).map_err(|error| error.to_string())?;
        asset.original_path = target_path
            .strip_prefix(project_dir)
            .unwrap_or(&target_path)
            .to_string_lossy()
            .to_string();
        asset.is_offline = false;
        bundled.insert(id, asset);
    }

    Ok(bundled)
}

#[tauri::command]
fn export_video_from_pngs(
    app: tauri::AppHandle,
    output_path: String,
    frame_pngs: Vec<Vec<u8>>,
    fps: f64,
    format: String,
    audio_wav: Option<Vec<u8>>,
    video_only: bool,
    output_width: Option<u32>,
    output_height: Option<u32>,
) -> Result<String, String> {
    if frame_pngs.is_empty() && !format.eq_ignore_ascii_case("Audio Only (WAV)") {
        return Err("Video export needs at least one frame.".to_string());
    }
    if fps <= 0.0 {
        return Err("Video export FPS must be greater than zero.".to_string());
    }

    let export_id = format!(
        "project_ugomemo_export_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis()
    );
    let temp_dir = std::env::temp_dir().join(export_id);
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;
    emit_export_progress(&app, "Preparing export", 1);

    if format.eq_ignore_ascii_case("Audio Only (WAV)") {
        let audio = audio_wav.ok_or_else(|| "Audio-only export needs a mixed WAV.".to_string())?;
        let output_path = PathBuf::from(output_path);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(&output_path, audio).map_err(|error| error.to_string())?;
        emit_export_progress(&app, "WAV written", 100);
        let _ = fs::remove_dir_all(&temp_dir);
        return Ok(output_path.to_string_lossy().to_string());
    }

    for (index, bytes) in frame_pngs.iter().enumerate() {
        fs::write(temp_dir.join(format!("frame_{index:05}.png")), bytes)
            .map_err(|error| error.to_string())?;
        let percent = (((index + 1) as f32 / frame_pngs.len() as f32) * 40.0).round() as u8;
        emit_export_progress(&app, "Staging frames", percent);
    }

    let audio_path = if let Some(bytes) = audio_wav {
        if bytes.is_empty() {
            None
        } else {
            let path = temp_dir.join("audio_mix.wav");
            fs::write(&path, bytes).map_err(|error| error.to_string())?;
            emit_export_progress(&app, "Staged audio mix", 45);
            Some(path)
        }
    } else {
        None
    };

    let output_path = PathBuf::from(output_path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut command = Command::new(ffmpeg_cmd());
    command
        .arg("-y")
        .arg("-framerate")
        .arg(format!("{fps}"))
        .arg("-i")
        .arg(temp_dir.join("frame_%05d.png"));

    if let Some(path) = &audio_path {
        if !video_only {
            command.arg("-i").arg(path);
        }
    }

    if let (Some(width), Some(height)) = (output_width, output_height) {
        if width > 0 && height > 0 {
            command
                .arg("-vf")
                .arg(format!("scale={width}:{height}:flags=neighbor"));
        }
    }

    if format.eq_ignore_ascii_case("GIF") {
        command.arg("-loop").arg("0");
    } else if format.eq_ignore_ascii_case("APNG") {
        command.arg("-plays").arg("0").arg("-f").arg("apng");
    } else if format.eq_ignore_ascii_case("WebM") {
        command
            .arg("-c:v")
            .arg("libvpx-vp9")
            .arg("-pix_fmt")
            .arg("yuva420p")
            .arg("-auto-alt-ref")
            .arg("0")
            .arg("-b:v")
            .arg("0")
            .arg("-crf")
            .arg("30");
    } else {
        command
            .arg("-c:v")
            .arg("libx264")
            .arg("-pix_fmt")
            .arg("yuv420p");
    }

    if audio_path.is_some()
        && !video_only
        && !format.eq_ignore_ascii_case("GIF")
        && !format.eq_ignore_ascii_case("APNG")
    {
        if format.eq_ignore_ascii_case("WebM") {
            command.arg("-c:a").arg("libopus");
        } else {
            command.arg("-c:a").arg("aac");
        }
        command.arg("-shortest");
    }

    let child = command
        .arg(&output_path)
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not run ffmpeg: {error}"))?;
    emit_export_progress(&app, "Encoding with ffmpeg", 65);

    let process_lock = EXPORT_PROCESS_ID.get_or_init(|| Mutex::new(None));
    {
        let mut current_process_id = process_lock.lock().map_err(|error| error.to_string())?;
        *current_process_id = Some(child.id());
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Could not wait for ffmpeg: {error}"))?;
    *process_lock.lock().map_err(|error| error.to_string())? = None;

    let _ = fs::remove_dir_all(&temp_dir);

    if !output.status.success() {
        return Err(format!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    emit_export_progress(&app, "Export complete", 100);
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn cancel_active_export() -> Result<(), String> {
    let process_lock = EXPORT_PROCESS_ID.get_or_init(|| Mutex::new(None));
    let mut current_process_id = process_lock.lock().map_err(|error| error.to_string())?;
    if let Some(pid) = *current_process_id {
        if cfg!(windows) {
            Command::new("taskkill")
                .arg("/PID")
                .arg(pid.to_string())
                .arg("/T")
                .arg("/F")
                .status()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .status()
                .map_err(|error| error.to_string())?;
        }
    }
    *current_process_id = None;
    Ok(())
}

fn emit_export_progress(app: &tauri::AppHandle, label: &str, percent: u8) {
    let _ = app.emit(
        "export-progress",
        ExportProgressPayload {
            label: label.to_string(),
            percent: percent.min(100),
        },
    );
}

fn write_project_file(path: &Path, project: &ProjectPayload) -> Result<(), String> {
    validate_project(&project)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        fs::create_dir_all(parent.join("image")).map_err(|error| error.to_string())?;
        fs::create_dir_all(parent.join("movie")).map_err(|error| error.to_string())?;
        fs::create_dir_all(parent.join("record")).map_err(|error| error.to_string())?;
    }

    let file = File::create(path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let metadata = ProjectMetadata {
        format: "project-ugomemo".to_string(),
        version: 1,
        width: project.width,
        height: project.height,
        fps: project.fps,
        background_color_id: project.background_color_id.clone(),
        active_layer_id: project.active_layer_id.clone(),
        current_page_index: project.current_page_index,
        audio_materials: project.audio_materials.clone(),
        recordings: project.recordings.clone(),
        timeline_clips: project.timeline_clips.clone(),
        audio_assets: project.audio_assets.clone(),
        audio_tracks: project.audio_tracks.clone(),
        brush_assets: project
            .brush_assets
            .iter()
            .map(project_brush_asset_metadata)
            .collect(),
        frames: project
            .frames
            .iter()
            .map(|frame| FrameMetadata {
                id: frame.id.clone(),
                layers: frame
                    .layers
                    .iter()
                    .map(|layer| LayerMetadata {
                        id: layer.id.clone(),
                        name: layer.name.clone(),
                        visible: layer.visible,
                        color_ids: layer.color_ids.clone(),
                        z_depth: layer.z_depth,
                        path: format!("frames/{}/layers/{}.png", frame.id, layer.id),
                    })
                    .collect(),
            })
            .collect(),
    };

    archive
        .start_file("metadata.json", options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(
            serde_json::to_string_pretty(&metadata)
                .map_err(|error| error.to_string())?
                .as_bytes(),
        )
        .map_err(|error| error.to_string())?;

    for frame in &project.frames {
        for layer in &frame.layers {
            let png = encode_png(project.width, project.height, &layer.pixels)?;
            archive
                .start_file(
                    format!("frames/{}/layers/{}.png", frame.id, layer.id),
                    options,
                )
                .map_err(|error| error.to_string())?;
            archive.write_all(&png).map_err(|error| error.to_string())?;
        }
    }

    for asset in &project.brush_assets {
        if asset.kind != "bitmap" {
            continue;
        }
        let source_path = PathBuf::from(&asset.stored_file_path);
        if asset.stored_file_path.is_empty() || !source_path.is_file() {
            eprintln!(
                "Project brush asset \"{}\" is missing; preserving metadata without asset bytes.",
                asset.id
            );
            continue;
        }
        let bytes = fs::read(&source_path).map_err(|error| error.to_string())?;
        let metadata = project_brush_asset_metadata(asset);
        archive
            .start_file(metadata.path, options)
            .map_err(|error| error.to_string())?;
        archive
            .write_all(&bytes)
            .map_err(|error| error.to_string())?;
    }

    archive.finish().map_err(|error| error.to_string())?;
    Ok(())
}

fn project_brush_asset_metadata(asset: &ProjectBrushAssetPayload) -> ProjectBrushAssetMetadata {
    let metadata_id = asset
        .id
        .strip_prefix("project:")
        .unwrap_or(&asset.id)
        .to_string();
    ProjectBrushAssetMetadata {
        id: metadata_id.clone(),
        name: asset.name.clone(),
        path: if asset.path.is_empty() {
            format!(
                "assets/brushes/{}.png",
                sanitize_asset_file_stem(&metadata_id)
            )
        } else {
            asset.path.clone()
        },
        kind: "bitmap".to_string(),
        source: "project".to_string(),
        mask_source_mode: normalize_brush_tip_mask_source_mode(&asset.mask_source_mode),
        smoothing: normalize_brush_tip_smoothing(&asset.smoothing),
    }
}

fn load_project_brush_assets(
    app: &tauri::AppHandle,
    selected_path: &Path,
    archive: &mut ZipArchive<File>,
    metadata_assets: &[ProjectBrushAssetMetadata],
) -> Result<Vec<ProjectBrushAssetPayload>, String> {
    let project_key = selected_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_project_name)
        .unwrap_or_else(|| "loaded_project".to_string());
    let target_dir = custom_brush_library_dir(app)?
        .join("project_assets")
        .join(project_key);
    fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;

    metadata_assets
        .iter()
        .map(|asset| {
            let file_name = Path::new(&asset.path)
                .file_name()
                .and_then(|value| value.to_str())
                .map(|value| value.to_string())
                .unwrap_or_else(|| format!("{}.png", sanitize_asset_file_stem(&asset.id)));
            let stored_path = target_dir.join(file_name);
            let stored_file_path = match read_zip_bytes(archive, &asset.path) {
                Ok(bytes) => {
                    fs::write(&stored_path, bytes).map_err(|error| error.to_string())?;
                    stored_path.to_string_lossy().to_string()
                }
                Err(error) => {
                    eprintln!(
                        "Project brush asset \"{}\" could not be loaded from {}: {}",
                        asset.id, asset.path, error
                    );
                    String::new()
                }
            };

            Ok(ProjectBrushAssetPayload {
                id: format!("project:{}", asset.id),
                name: asset.name.clone(),
                path: asset.path.clone(),
                kind: if asset.kind.is_empty() {
                    "bitmap".to_string()
                } else {
                    asset.kind.clone()
                },
                source: "project".to_string(),
                stored_file_path,
                mask_source_mode: normalize_brush_tip_mask_source_mode(&asset.mask_source_mode),
                smoothing: normalize_brush_tip_smoothing(&asset.smoothing),
            })
        })
        .collect()
}

fn sanitize_asset_file_stem(value: &str) -> String {
    let safe = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();
    if safe.is_empty() {
        "custom_brush".to_string()
    } else {
        safe
    }
}

fn normalize_brush_tip_mask_source_mode(value: &str) -> String {
    match value {
        "luminance"
        | "inverted-luminance"
        | "alpha-luminance"
        | "alpha-inverted-luminance"
        | "alpha" => value.to_string(),
        _ => default_brush_tip_mask_source_mode(),
    }
}

fn normalize_brush_tip_smoothing(value: &str) -> String {
    match value {
        "nearest" | "smooth" | "inherit" => value.to_string(),
        _ => default_brush_tip_smoothing(),
    }
}

fn documents_dir() -> Result<PathBuf, String> {
    dirs::document_dir().ok_or_else(|| "Could not resolve the Documents directory.".to_string())
}

fn resolve_asset_path(project_dir: Option<&Path>, path: &str) -> PathBuf {
    let candidate = PathBuf::from(path);
    if candidate.is_absolute() {
        candidate
    } else if let Some(base) = project_dir {
        base.join(candidate)
    } else {
        candidate
    }
}

fn ffmpeg_cmd() -> String {
    if let Ok(val) = std::env::var("UGOMEMO_FFMPEG_PATH") {
        return val;
    }
    let names: Vec<&str> = if cfg!(windows) {
        vec!["ffmpeg.exe", "ffmpeg"]
    } else {
        vec!["ffmpeg"]
    };
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in &names {
                let p = dir.join("binaries").join(name);
                if p.exists() {
                    return p.to_string_lossy().to_string();
                }
                let p2 = dir.join("resources").join("binaries").join(name);
                if p2.exists() {
                    return p2.to_string_lossy().to_string();
                }
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        for name in &names {
            let p = cwd.join("src-tauri").join("binaries").join(name);
            if p.exists() {
                return p.to_string_lossy().to_string();
            }
        }
    }
    names[0].to_string()
}

fn ffprobe_cmd() -> String {
    if let Ok(val) = std::env::var("UGOMEMO_FFPROBE_PATH") {
        return val;
    }
    let names: Vec<&str> = if cfg!(windows) {
        vec!["ffprobe.exe", "ffprobe"]
    } else {
        vec!["ffprobe"]
    };
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in &names {
                let p = dir.join("binaries").join(name);
                if p.exists() {
                    return p.to_string_lossy().to_string();
                }
                let p2 = dir.join("resources").join("binaries").join(name);
                if p2.exists() {
                    return p2.to_string_lossy().to_string();
                }
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        for name in &names {
            let p = cwd.join("src-tauri").join("binaries").join(name);
            if p.exists() {
                return p.to_string_lossy().to_string();
            }
        }
    }
    names[0].to_string()
}

fn probe_audio_duration_ms(path: &str) -> Result<u64, String> {
    let output = Command::new(ffprobe_cmd())
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(path)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let seconds = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|error| error.to_string())?;
    Ok((seconds.max(0.0) * 1000.0).round() as u64)
}

fn summarize_audio_file_bytes(path: &Path) -> Result<Vec<f32>, String> {
    const BUCKETS: usize = 160;
    if let Ok(decoded) = summarize_audio_with_ffmpeg(path, BUCKETS) {
        return Ok(decoded);
    }

    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    if bytes.is_empty() {
        return Ok(vec![0.0; BUCKETS]);
    }

    let mut summary = Vec::with_capacity(BUCKETS);
    let chunk_size = (bytes.len() / BUCKETS).max(1);
    for chunk in bytes.chunks(chunk_size).take(BUCKETS) {
        let peak = chunk
            .iter()
            .map(|byte| ((*byte as f32 - 128.0).abs()) / 128.0)
            .fold(0.0_f32, f32::max);
        summary.push(peak.min(1.0));
    }
    while summary.len() < BUCKETS {
        summary.push(0.0);
    }

    Ok(summary)
}

fn summarize_audio_with_ffmpeg(path: &Path, buckets: usize) -> Result<Vec<f32>, String> {
    let output = Command::new(ffmpeg_cmd())
        .arg("-v")
        .arg("error")
        .arg("-i")
        .arg(path)
        .arg("-f")
        .arg("s16le")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("8000")
        .arg("pipe:1")
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() || output.stdout.len() < 2 {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let samples: Vec<i16> = output
        .stdout
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();
    if samples.is_empty() {
        return Ok(vec![0.0; buckets]);
    }

    let chunk_size = (samples.len() / buckets).max(1);
    let mut summary = samples
        .chunks(chunk_size)
        .take(buckets)
        .map(|chunk| {
            chunk
                .iter()
                .map(|sample| (*sample as f32).abs() / i16::MAX as f32)
                .fold(0.0_f32, f32::max)
                .min(1.0)
        })
        .collect::<Vec<_>>();

    while summary.len() < buckets {
        summary.push(0.0);
    }

    Ok(summary)
}

fn project_package_paths(documents: &Path, project_name: &str) -> ProjectSaveResult {
    let project_dir = documents.join("Project Ugomemo").join(project_name);
    let project_path = project_dir.join(format!("{project_name}.upj"));

    project_package_paths_for_file(&project_path, project_name)
        .expect("default project package path always has a parent directory")
}

fn project_package_paths_for_file(
    project_path: &Path,
    project_name: &str,
) -> Result<ProjectSaveResult, String> {
    let project_dir = project_path
        .parent()
        .ok_or_else(|| "Project path has no parent directory.".to_string())?;
    let image_dir = project_dir.join("image");
    let movie_dir = project_dir.join("movie");
    let record_dir = project_dir.join("record");

    Ok(ProjectSaveResult {
        project_name: project_name.to_string(),
        project_path: project_path.to_string_lossy().to_string(),
        image_dir: image_dir.to_string_lossy().to_string(),
        movie_dir: movie_dir.to_string_lossy().to_string(),
        record_dir: record_dir.to_string_lossy().to_string(),
    })
}

fn project_package_paths_from_selected_path(
    selected_path: &Path,
    project_name: &str,
) -> Result<ProjectSaveResult, String> {
    let selected_dir = selected_path
        .parent()
        .ok_or_else(|| "Project path has no parent directory.".to_string())?;
    let project_dir = if selected_dir
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|directory_name| directory_name == project_name)
    {
        selected_dir.to_path_buf()
    } else {
        selected_dir.join(project_name)
    };
    let project_path = project_dir.join(format!("{project_name}.upj"));

    project_package_paths_for_file(&project_path, project_name)
}

fn ensure_upj_extension(path: PathBuf) -> PathBuf {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("upj"))
    {
        path
    } else {
        path.with_extension("upj")
    }
}

fn project_name_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "untitled_project".to_string())
}

fn sanitize_project_name(name: &str) -> String {
    let mut sanitized = String::new();
    let trimmed = name
        .trim()
        .trim_end_matches(".upj")
        .trim_end_matches(".UPJ");

    for character in trimmed.chars() {
        if character.is_alphanumeric() || character == '-' || character == '_' {
            sanitized.push(character);
        } else if character.is_whitespace() || character == '.' {
            sanitized.push('_');
        }
    }

    let sanitized = sanitized.trim_matches('_').to_string();
    if sanitized.is_empty() {
        "untitled_project".to_string()
    } else {
        sanitized
    }
}

fn validate_project(project: &ProjectPayload) -> Result<(), String> {
    if project.width == 0 || project.height == 0 {
        return Err("Project dimensions must be greater than zero.".to_string());
    }
    if project.fps <= 0.0 {
        return Err("Project FPS must be greater than zero.".to_string());
    }

    let expected_len = (project.width as usize)
        .checked_mul(project.height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "Project dimensions are too large.".to_string())?;

    if project.frames.is_empty() {
        return Err("Project must contain at least one frame.".to_string());
    }

    for frame in &project.frames {
        for layer in &frame.layers {
            if layer.pixels.len() != expected_len {
                return Err(format!(
                    "Layer '{}' in frame '{}' has {} bytes, expected {}.",
                    layer.id,
                    frame.id,
                    layer.pixels.len(),
                    expected_len
                ));
            }
        }
    }

    Ok(())
}

fn encode_png(width: u32, height: u32, pixels: &[u8]) -> Result<Vec<u8>, String> {
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "Image dimensions are too large.".to_string())?;

    if pixels.len() != expected_len {
        return Err(format!(
            "Invalid RGBA buffer length: got {}, expected {}.",
            pixels.len(),
            expected_len
        ));
    }

    let mut bytes = Vec::new();
    let encoder = PngEncoder::new(Cursor::new(&mut bytes));
    encoder
        .write_image(pixels, width, height, ColorType::Rgba8.into())
        .map_err(|error| error.to_string())?;

    Ok(bytes)
}

fn decode_png_rgba(width: u32, height: u32, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory(bytes).map_err(|error| error.to_string())?;
    if image.width() != width || image.height() != height {
        return Err(format!(
            "Layer PNG dimensions are {}x{}, expected {}x{}.",
            image.width(),
            image.height(),
            width,
            height
        ));
    }

    Ok(image.to_rgba8().into_raw())
}

fn read_zip_text(archive: &mut ZipArchive<File>, path: &str) -> Result<String, String> {
    let mut file = archive.by_name(path).map_err(|error| error.to_string())?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .map_err(|error| error.to_string())?;
    Ok(text)
}

fn read_zip_bytes(archive: &mut ZipArchive<File>, path: &str) -> Result<Vec<u8>, String> {
    let mut file = archive.by_name(path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}

fn pixel_index(x: usize, y: usize, width: usize) -> usize {
    (y * width + x) * 4
}

fn pixel_matches(pixels: &[u8], index: usize, color: [u8; 4]) -> bool {
    pixels[index] == color[0]
        && pixels[index + 1] == color[1]
        && pixels[index + 2] == color[2]
        && pixels[index + 3] == color[3]
}

fn default_clip_volume() -> f32 {
    1.0
}

fn default_project_fps() -> f64 {
    6.0
}

fn default_brush_tip_mask_source_mode() -> String {
    "alpha".to_string()
}

fn default_brush_tip_smoothing() -> String {
    "inherit".to_string()
}

fn custom_brush_library_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("brush_tips"))
        .map_err(|error| error.to_string())
}

fn custom_brush_asset_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(custom_brush_library_dir(app)?.join("assets"))
}

fn custom_brush_library_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(custom_brush_library_dir(app)?.join("library.json"))
}

fn custom_brush_presets_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(custom_brush_library_dir(app)?.join("presets.json"))
}

fn read_custom_brush_library(app: &tauri::AppHandle) -> Result<Vec<CustomBrushTipPayload>, String> {
    let path = custom_brush_library_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn write_custom_brush_library(
    app: &tauri::AppHandle,
    library: &[CustomBrushTipPayload],
) -> Result<(), String> {
    let path = custom_brush_library_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(library).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

fn read_custom_brush_presets(app: &tauri::AppHandle) -> Result<Vec<BrushPresetPayload>, String> {
    let path = custom_brush_presets_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn write_custom_brush_presets(
    app: &tauri::AppHandle,
    presets: &[BrushPresetPayload],
) -> Result<(), String> {
    let path = custom_brush_presets_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string_pretty(presets).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            encode_layer_png,
            flood_fill,
            save_upj_project,
            default_project_package_paths,
            default_project_save_dialog_path,
            save_project_package,
            load_project_package,
            write_binary_file,
            copy_file,
            encode_wav_to_mp3_file,
            delete_file,
            rename_file,
            load_custom_brush_tips,
            load_custom_brush_presets,
            save_custom_brush_presets,
            import_custom_brush_tip,
            inspect_audio_files,
            validate_audio_assets,
            bundle_project_assets,
            export_video_from_pngs,
            cancel_active_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
