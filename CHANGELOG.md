# Changelog

## 2026-07-08

### Fixed

- Reversed timeline clips now play the same source segment backwards; trimmed or split clips previously played a different part of the audio when reversed.
- Deleting, duplicating, splitting, reversing, pasting, and drag-trimming timeline clips now mark the project as having unsaved changes, so the close warning fires.
- Filled triangles and rectangles no longer miss their bottom pixel row.
- Timeline audio is no longer double-scheduled when playback starts at frame 0.
- Resuming playback partway through a looped clip now starts from the correct position inside the loop.
- Tone fills and tone brush strokes now render from the same pattern tile, so dot/line/noise tones align and match in size.
- Changing a layer color after adding, removing, or reordering frames no longer remaps the wrong frame or layer in undo history.
- Audio duration probe failures are reported on import instead of silently becoming 0 ms.
- Loading a `.upj` now caps zip entry sizes and validates PNG dimensions before decoding, guarding against corrupt or malicious archives.

### Verified

- Ran `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` successfully.

## 2026-06-16

### Changed

- Improved the GitHub Pages site in `docs/` for first-time visitors.
- Expanded the English and Japanese pages with Hero copy, Current Status, Concept, Features, Basic Workflow, Samples, Tech Stack, Project File, Roadmap, and Known Limitations sections.
- Made the Releases link the primary trial/download entry point instead of adding unverified direct download links.
- Kept the existing sample animation and documented the Samples section as currently containing one sample, with room for future examples.
- Added responsive styles for the new site sections while preserving the existing white grid, pink controls, monospace type, and high-contrast panel style.
- Added root `AGENTS.md` as a concise coding-agent work guide.
- Updated `README.md` with the GitHub Pages role, release-link policy, current sample note, and documentation links.
- Updated `README.md` to link to `AGENTS.md` and describe it as the agent-facing guide.
- Updated `docs/DESIGN.md` with the GitHub Pages content and visual design policy.

### Verified

- Confirmed the latest GitHub Release on 2026-06-16 as `v0.1.5-test`.
- Confirmed the release assets as macOS Apple Silicon `.dmg` and Windows x64 `.exe` / `.msi`.
- Confirmed the only published sample asset in `docs/assets/` is `sample-animation.mp4`.
- Confirmed this repository did not previously contain project-level `skills.md` or `agents.md`; root `AGENTS.md` is now the agent guide.
- Ran `npm run build` successfully.
- Checked the GitHub Pages site locally over HTTP on desktop and mobile-width viewports with no horizontal overflow.
