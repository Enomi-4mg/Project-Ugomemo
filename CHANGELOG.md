# Changelog

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
