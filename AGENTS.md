# AGENTS.md

## Project Overview

Project Ugomemo is a Tauri v2 desktop app for making compact, frame-based pixel animations. The app combines a React/TypeScript drawing UI, Rust-backed native file/export commands, Web Audio API playback/mixdown, `.upj` project save/load, and ffmpeg-based export.

Use this file as the quick operating guide for coding agents. Use `README.md` for product behavior and user-facing details, and `docs/DESIGN.md` for design intent, architecture, and edge cases.

## Repository Map

- `src/`: React/TypeScript frontend, drawing core, UI state, tool strategies, keyboard shortcuts, and Tauri command wrappers.
- `src-tauri/`: Tauri v2 Rust backend, native commands, project package I/O, ffmpeg export flow, app config, icons, and bundled binary notices.
- `docs/`: GitHub Pages site, design notes, sidecar guide, screenshots, and sample media.
- `.github/workflows/`: CI and release build workflows for macOS and Windows.
- `README.md`: human-facing feature overview, specs, run/build/release notes, and documentation links.
- `docs/DESIGN.md`: deeper architecture, UI, `.upj`, Audio Mode, export, and GitHub Pages design guidance.
- `CHANGELOG.md`: notable project and documentation changes.

## Setup and Commands

- Install dependencies: `npm ci`
- Start Vite dev server: `npm run dev`
- Build frontend/type-check: `npm run build`
- Start Tauri dev app: `npm run tauri:dev`
- Build Tauri release bundle: `npm run tauri:build`
- Check Rust backend: `cargo check --manifest-path src-tauri/Cargo.toml`

Prefer the smallest relevant check for the files changed. CI currently runs `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` on macOS and Windows.

## Working Rules

- Prefer existing patterns and local helpers over new abstractions.
- Keep changes scoped to the requested behavior; do not refactor unrelated code.
- Before changing `.upj`, Audio Mode, Export, ffmpeg sidecar handling, or Tauri file I/O, read the relevant sections of `README.md` and `docs/DESIGN.md`.
- Do not invent sample files, release assets, direct download URLs, or compatibility claims. Verify they exist first.
- Preserve user or generated work already present in the tree. Do not revert unrelated dirty files.

## Frontend and UI

- Preserve the app's white grid, pink controls, deep pink active state, monospace type, and strong panel borders unless the task explicitly changes the visual direction.
- Use `lucide-react` icons for icon buttons when a matching icon exists.
- Keep icon buttons accessible with `aria-label` and `title`.
- Avoid mobile horizontal overflow. For GitHub Pages and app UI changes, check narrow layouts when the change affects layout.
- For media and screenshots in `docs/`, use meaningful `alt` text or nearby explanatory text.

## Tauri and Rust

- Treat React state, Tauri IPC commands, and Rust file/export commands as a single contract. Update both sides together when request/response shapes change.
- If `src-tauri/tauri.conf.json`, bundled resources, `src-tauri/binaries/`, or ffmpeg/ffprobe handling changes, check `.github/workflows/release.yml` for release impact.
- Keep `.upj` loading backward-compatible when practical. Missing newer metadata should default safely rather than breaking older projects.
- Do not remove license or notice files related to bundled ffmpeg assets.

## Docs and GitHub Pages

- Update English and Japanese pages together: `docs/index.html` and `docs/ja/index.html`.
- Keep GitHub Pages focused on overview, appeal, current status, samples, and links. Put detailed specs in `README.md` or `docs/DESIGN.md`.
- For release information, link to GitHub Releases and mention only verified tags/assets.
- Samples must reference real files in `docs/assets/`. Do not add placeholder `.upj`, image, video, or direct download links.
- Preserve the current static site style in `docs/pages.css` unless asked to redesign it.

## Testing Guidance

- Code changes touching TypeScript/React should run `npm run build`.
- Rust/Tauri backend changes should run `cargo check --manifest-path src-tauri/Cargo.toml`; run `npm run tauri:build` only when packaging/resource behavior needs verification.
- GitHub Pages-only changes do not require a full app build, but should be checked with a local static server when layout or media references change.
- If a command cannot be run, report the reason and the remaining risk.

## Release Notes

- User-facing behavior or site changes should be recorded in `CHANGELOG.md`.
- Design or architecture policy changes should update `docs/DESIGN.md`.
- Overview, setup, release, or documentation navigation changes should update `README.md`.
