# Changelog

## Unreleased

### Changed

- Added direct `v1.1.0` package download links for Linux and Windows to the README and release notes, and refreshed the supporting docs to match
- Added a GitHub Actions Linux packaging workflow on `ubuntu-22.04` so public `AppImage`, `deb`, and `rpm` artifacts are built from a more compatible glibc baseline than rolling-release local builds
- Updated the Linux packaging workflow to install ImageMagick so the release build can regenerate icon assets on GitHub-hosted Ubuntu runners

### Fixed

- Documented and hardened the Linux release process around `node-pty` so Mint and Ubuntu users are less likely to hit startup failures caused by binaries compiled on newer distros such as Arch
- Made the icon-generation script accept either ImageMagick's `magick` or `convert` CLI so Linux CI builds do not fail on Ubuntu runner command-name differences

## 1.1.0 - 2026-03-31

### Added

- Saved workspaces with named workspace snapshots
- Workspace sidebar for browsing, switching, renaming, deleting, and saving workspaces
- Built-in workspace templates for full-stack work, monitoring, debugging, and documentation flows
- Template gallery, sidebar shortcuts, and command palette actions for creating a new workspace from a starter layout
- Save-current-workspace as custom template, with rename and delete actions for user-created templates
- Project-aware workspace setup with saved project paths and project labels
- Per-terminal startup actions so restored workspaces can reopen in specific directories and optionally run boot commands
- Window pinning so terminal cards can be locked against drag and resize changes
- In-app workspace naming dialog for save-as and rename flows
- Per-window theme overrides with inherit-from-workspace behavior and card-level color identity
- Session metadata badges for shell, current directory, activity state, and unread output
- Searchable command palette with keyboard navigation for app actions, workspace switching, theme changes, and session focusing

### Changed

- Expanded workspace persistence from a single saved layout into a multi-workspace model
- Restoring a workspace now preserves session metadata such as title, minimized state, pinned state, and per-window theme overrides
- Existing single-layout installs are migrated into a default saved workspace automatically
- Upgraded core desktop and build dependencies, including Electron, Vite, and electron-builder, to clear known security advisories
- Development startup now auto-selects an available high port for the Vite renderer instead of assuming `5173`

### Fixed

- Development shutdown leaving orphaned Vite and watch processes behind after `Ctrl+C` or closing the Electron window, which kept the dev port occupied on the next launch
- Last-window close behavior leaving Sorbet resident without a visible window on some platforms, which kept `npm start` and packaged launches from fully terminating
- PTY cwd polling intervals surviving session-map cleanup during shutdown, which could keep Electron alive after the window had already closed
- Workspace switching races that let restored terminals mount against a stale workspace record, causing project paths, themes, and startup directories to bleed across workspaces
- Workspace snapshot updates for non-current workspaces overwriting the global live layout/theme cache used by the active workspace
- Terminal resize/focus races that could leave xterm.js trying to measure a disposed terminal and repeatedly throwing `Cannot read properties of undefined (reading 'dimensions')`
- Persisted layout snapshots with invalid `minW` or `minH` values that triggered `react-grid-layout` warnings and unstable card behavior after restore
- Workspace save and rename interactions that were unreliable when driven by native prompt dialogs
- Blank-screen regression triggered by typing into the workspace naming dialog
- Blank-screen regression triggered by typing into workspace setup project-path and startup-action fields
- Terminal PTYs getting torn down after saving workspace startup settings, which left cards mounted without a live shell prompt
- Workspace project paths like `home/...` or `~/...` silently falling back to the home directory during restore
- Workspace startup settings not being written directly into saved workspace snapshots
- Cross-workspace terminal state leaking when different workspaces reused the same saved session IDs
- Workspace switches racing old and new PTY sessions, which intermittently produced `Session already exists` and the wrong working directory
- Restored workspaces reusing persisted session IDs as live runtime IDs, which let PTY/process state bleed between workspaces
- Renderer state sync issues after workspace creation and rename flows
- Save-as workspace copies dropping project-aware metadata
- Black-screen development startup caused by Electron 41 preload/sandbox behavior changes
- Dev-session failures caused by port collisions between multiple local applications
- Linux development startup noise and hidden-window behavior that made Electron launch failures harder to diagnose
- Linux release packaging validation failures after the electron-builder 26 upgrade, caused by stale desktop-entry config keys

## 1.0.0 - 2026-03-21

First stable release of `Sorbet`.

### Added

- Real PTY-backed terminal sessions using `node-pty`
- Multi-window terminal workspace built on `react-grid-layout`
- Minimize, maximize, restore, and close controls for terminal cards
- Editable terminal titles with a hover-visible rename affordance
- Minimized terminal dock
- Built-in theme picker with the new branded default `Sorbet` theme
- Custom user themes loaded from JSON files in the user theme directory
- User-editable `preferences.json` with inline guidance and font recommendations
- Native application menu with Sorbet Help links and Preferences actions
- Clipboard support through the Electron preload bridge
- Default copy and paste shortcuts for terminals
- Middle-click paste support
- Linux packaging output for `AppImage`, `deb`, and `rpm`
- Generated release icon assets derived from the Sorbet application icon
- Windows NSIS installer build workflow in GitHub Actions
- Repo-local packaging scripts for icon generation and RPM creation

### Changed

- Promoted `Sorbet` to the default terminal theme for `1.0.0`
- Renamed `Sorbet Dark` to `Midnight Graphite`
- Reworked window dragging so the full title bar acts as the drag region
- Smoothed terminal resize behavior with a finer grid and more responsive fit handling
- Changed new terminal placement so windows open horizontally to the right when space is available
- Increased default card size for new terminal windows
- Updated development startup so closing the Electron window ends the full `npm start` session
- Replaced the default Electron menu with a Sorbet-branded native application menu
- Standardized the published package name to `@pinkpixel/sorbet` with the `sorbet` launcher command
- Added release-oriented build scripts for Linux packaging and Windows installer generation

### Fixed

- Renderer crashes caused by unsafe platform access in the browser bundle
- Terminal startup issues that previously prevented a real shell prompt from appearing
- Resize behavior that only worked reliably at coarse snap points
- Card control hit targets overlapping resize affordances
- Dragging inconsistencies in the terminal card header
- Preferences and theme-file launching issues that could freeze the app or open JSON files in the wrong application
- PTY lifecycle bugs where terminal sessions could be torn down during unrelated UI updates
- Blank-screen renderer regression caused by callback initialization order
- Packaged-app startup regression where production builds could try to load the Vite dev server instead of bundled renderer assets
- Linux desktop integration mismatch that caused generic gear icons in the taskbar for packaged builds

### Notes

- Linux GPU, ANGLE, and Vulkan warnings seen during development were investigated and treated as environment noise rather than product blockers.
- The generated preferences file now includes inline help, common monospace font suggestions, and links to Nerd Fonts for users who want broader glyph coverage.
- Linux `arm64` packaging is supported through the release scripts, but should be built on an `arm64` runner or machine so native modules rebuild for the correct architecture.
