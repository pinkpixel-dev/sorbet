# Technical Overview and Development Guide

## Purpose

This document explains how `Sorbet` is currently structured, how the runtime pieces communicate, and where to make changes when extending the project.

Sorbet is a desktop terminal workspace built on Electron. It combines:

- a privileged Electron main process
- a secure preload bridge
- a React renderer UI
- PTY-backed shell processes
- packaging and release scripts for desktop distribution

The design keeps process management, menus, clipboard/native integration, and user configuration in the main process while the renderer stays focused on UI state, layout, and terminal presentation.

## Runtime Overview

The runtime is composed of five major layers:

1. Electron main process
2. Electron preload bridge
3. React renderer
4. PTY shell sessions
5. Packaging and release tooling

### Runtime flow

1. Electron launches and creates the main window.
2. The renderer loads either from the Vite dev server or the built renderer bundle.
3. The renderer requests workspace state, user preferences, and custom themes from `window.sorbet.store`.
4. If a saved workspace exists, the Zustand store reconstructs the current workspace snapshot from it, including any project path and terminal startup metadata.
5. If no saved workspace exists, the renderer creates one initial terminal session.
6. Each `TerminalCard` mounts xterm.js and asks the main process to spawn a PTY, optionally passing a saved startup cwd and boot command.
7. Input from xterm.js is forwarded to the PTY over IPC.
8. Output from the PTY is streamed back to the card over IPC.
9. Terminal resize work is guarded against disconnected DOM nodes and disposed xterm instances so renderer cleanup cannot keep scheduling invalid `fit()` calls.
10. Workspace switches are applied atomically in the renderer so the active workspace record, project path, theme, and terminal snapshot move together before new cards mount.
11. Layout, saved-workspace, workspace-theme, and per-window theme changes are persisted through `electron-store`.
12. Built-in and user-saved workspace templates are exposed from the main process and can be instantiated into fresh saved workspaces with new session IDs.
13. The command palette builds a searchable list of actions from live renderer state so users can switch workspaces, start from templates, change themes, and jump between sessions quickly.
14. Preference and custom-theme changes are detected in the main process and pushed back to the renderer over a lightweight config-change event.
15. Packaged builds load the bundled renderer based on `app.isPackaged` rather than environment variables.

## Directory Guide

### `src/main`

This directory contains the Electron main process and preload bridge.

- `main.ts`
  - creates the `BrowserWindow`
  - configures Electron lifecycle behavior
  - quits the full app when the last Sorbet window closes on any platform
  - selects and spawns shell processes with `node-pty`
  - owns the PTY session map
  - clears PTY cwd polling timers during session teardown so Electron can fully exit
  - forwards PTY output and exit events to the renderer
  - persists saved workspaces, layout snapshots, selected workspace theme, and per-window theme overrides
  - owns the built-in workspace template catalog, persists custom templates, and creates new workspaces from template snapshots
  - creates and watches `preferences.json` plus the custom theme directory
  - defines the native application menu
- `preload.ts`
  - defines the safe API exposed to the renderer as `window.sorbet`
  - wraps PTY, clipboard, and store access

### `src/renderer`

This directory contains the UI and renderer-side app state.

- `App.tsx`
  - top-level application shell
  - workspace initialization
  - saved-workspace sidebar and dialog flows
  - project-aware workspace setup modal
  - workspace-template gallery plus save, rename, delete, and create-from-template flows
  - command palette command generation and keyboard shortcuts
  - grid layout configuration
  - atomic workspace transition handling and autosave suppression during restore
  - workspace theme selection
  - per-window theme resolution
  - preference loading
  - custom theme loading
  - minimized-session dock
- `components/CommandPalette.tsx`
  - searchable modal command palette
  - keyboard navigation and command execution
- `components/TerminalCard.tsx`
  - xterm.js lifecycle
  - PTY creation and teardown
  - input/output wiring
  - terminal resizing
  - clipboard shortcuts and paste behavior
  - title editing
  - live session metadata, activity state, and unread markers
  - per-card theme selection and inherit behavior
  - card color identity affordances
  - card window controls
- `components/ThemePicker.tsx`
  - theme dropdown UI
- `store/index.ts`
  - Zustand store for sessions, workspace theme, active state, layout, and workspace snapshot restoration
- `themes/index.ts`
  - built-in theme catalog
  - default terminal preference values
- `types/index.ts`
  - renderer-side shared types and `window.sorbet` typing

### Supporting files

- `vite.config.mjs`
  - Vite configuration for the renderer build and dev server
  - reads `SORBET_DEV_PORT` so Electron and Vite can share the same dev server address
- `scripts/start-dev.cjs`
  - development orchestrator that picks an available port, starts the renderer and TypeScript watchers, launches Electron with the same environment, and tears down the full child process tree on shutdown
- `scripts/start-electron.cjs`
  - helper script that launches Electron with the correct environment in development and forwards shutdown signals to the Electron process group
 - `scripts/run-vite-dev.cjs`
  - helper script that launches the Vite dev server and ensures shutdown signals terminate the whole Vite process group
- `scripts/generate-icons.sh`
  - generates Linux PNG icon sizes and the Windows `.ico` file from `assets/icon.png`
- `scripts/build-rpm.sh`
  - creates the Linux `.rpm` package from the unpacked Electron build
- `README.md`
  - user-facing project overview and setup instructions
- `CHANGELOG.md`
  - release history

## Main Process Design

The main process is the trust boundary for anything that requires Node.js, native access, or desktop integration.

### Responsibilities

- native window creation
- platform-specific shell resolution
- PTY process lifecycle
- persistence via `electron-store`
- secure handling of external links
- native application menu construction
- user configuration file management
- clipboard/file-launch integration support for preferences and theme editing
- packaged-app environment detection and runtime icon selection

### Window lifecycle

The main window is created hidden and shown only after `ready-to-show`. This reduces visual flicker during startup. The window is configured with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: false`
- a preload script
- a platform icon on Linux and Windows package builds

That combination keeps direct Node integration out of the renderer while preserving the preload bridge behavior Sorbet relies on under newer Electron releases.

For `v1.1.0`, packaged builds use `app.isPackaged` to decide whether to load the active local dev server or the bundled renderer assets. In development, the shared dev-server port comes from `SORBET_DEV_PORT`, which prevents Electron and Vite from drifting out of sync when a default port is already occupied.

### PTY management

PTY sessions are stored in a `Map<string, PtySession>`. Each session contains:

- the `node-pty` instance
- the renderer-facing session ID
- the resolved shell label
- the last known current working directory

The main process exposes IPC handlers/events for:

- `pty:create`
- `pty:write`
- `pty:resize`
- `pty:kill`

On process exit, the session is removed from the map and an exit event is pushed back to the renderer.
Sorbet also performs best-effort cwd polling so terminal cards can show live working-directory metadata without giving the renderer direct process access.

Persisted layout items are normalized in the main process before they re-enter the renderer. That keeps `w` and `h` aligned with any stored `minW` and `minH` values, which prevents broken historical snapshots from producing invalid `react-grid-layout` state after restore.

Workspace snapshot writes are also scoped so only the current workspace updates the legacy `layout` and `theme` cache. That avoids non-current workspace edits pushing stale visual state back into the active canvas.

### Shell resolution

The shell selection logic prefers:

1. `SORBET_SHELL`
2. common Bash/Zsh paths
3. `process.env.SHELL`
4. `/bin/sh`

Windows uses `powershell.exe`.

Interactive shells are launched with `-i` when appropriate so users get normal interactive shell behavior and startup files.

### Persistence and user config

Sorbet uses two persistence paths:

- `electron-store` for:
  - `layout`
  - `workspaces`
  - `workspaceTemplates`
  - `theme`
- JSON files in Electron `userData` for:
  - `preferences.json`
  - `themes/*.json`

The preferences file is intentionally human-editable and includes an ignored `_template` section with inline guidance. The custom theme directory is watched and valid theme files are added to the renderer theme list automatically. Workspace snapshots carry the selected workspace theme plus any session-level `themeId` overrides.

Workspace templates now come from two sources: built-in starters shipped with the app and custom templates saved by the user. The main process exposes the combined template catalog to the renderer over IPC, then clones the selected template into a normal saved workspace with fresh session IDs and timestamps so the persisted workspace model stays the single source of truth.

Saved workspaces can also carry optional `projectPath` and `projectName` metadata, and those values now survive template creation plus regular workspace save-as copies. Individual terminal sessions may define `startupCwd` and `startupCommand`, which lets a restored workspace reopen in the right directories and optionally kick off repeatable boot commands.

## Preload Bridge Design

The preload script exposes a small API under `window.sorbet`.

### Exposed namespaces

- `window.sorbet.platform`
- `window.sorbet.clipboard`
  - `readText()`
  - `writeText(text)`
- `window.sorbet.pty`
  - `create(sessionId, cols, rows, options?)`
  - `write(sessionId, data)`
  - `resize(sessionId, cols, rows)`
  - `kill(sessionId)`
  - `onData(sessionId, callback)`
  - `onExit(sessionId, callback)`
  - `onMetadata(sessionId, callback)`
- `window.sorbet.store`
  - `getLayout()`
  - `saveLayout(layout)`
  - `getTheme()`
  - `saveTheme(theme)`
  - `getWorkspaces()`
  - `getWorkspaceTemplates()`
  - `createWorkspace(name, snapshot, makeCurrent?, options?)`
  - `createWorkspaceFromTemplate(templateId, name?)`
  - `createWorkspaceTemplate(name, snapshot, options?)`
  - `updateWorkspaceTemplate(id, updates)`
  - `deleteWorkspaceTemplate(id)`
  - `updateWorkspace(id, updates)`
  - `updateWorkspaceSnapshot(id, snapshot)`
  - `deleteWorkspace(id)`
  - `setCurrentWorkspace(id)`
  - `getPreferences()`
  - `getCustomThemes()`
  - `onConfigChanged(callback)`

### Why this matters

This pattern keeps Electron-specific details out of the UI layer and helps the renderer stay testable and safer by default. If new privileged operations are added later, they should be routed through this bridge rather than exposing direct Node access to the renderer.

## Renderer Design

The renderer is responsible for translating application state into the terminal workspace UI.

### `App.tsx`

`App.tsx` owns top-level workspace orchestration.

Key responsibilities:

- restoring persisted workspace state on first load
- loading and switching saved workspaces
- loading workspace templates and creating fresh workspaces from them
- associating a workspace with a project path
- defining per-terminal startup cwd and startup commands
- keeping workspace setup dialog inputs stable while typing by snapshotting values before state updates
- reapplying workspace startup settings inside the app without requiring a full app restart
- normalizing user-entered workspace paths before validation so restore logic can honor inputs like `~/project`
- tearing down current PTYs before applying another workspace so reused session ids cannot collide in the main process
- materializing fresh runtime session ids when a saved workspace is restored, so persistence ids are not reused as live PTY ids
- saving the current workspace as a reusable custom template
- renaming and deleting custom templates
- loading user preferences and custom themes
- creating a default terminal when there is no saved layout
- managing the grid width for `react-grid-layout`
- autosaving layout changes
- autosaving the current workspace snapshot
- handling workspace theme changes
- resolving per-window theme overrides against the available theme catalog
- binding `Cmd/Ctrl+T` for new sessions
- rendering the workspace sidebar, template gallery, and naming dialogs
- rendering the minimized-session dock

### Session creation

New sessions are created in two steps:

1. build a new `LayoutItem`
2. add a matching `TerminalSession` to the Zustand store

The session is not fully alive until `TerminalCard` mounts and the PTY is successfully created.

### `TerminalCard.tsx`

`TerminalCard` is the most behavior-heavy UI component.

Responsibilities include:

- creating an xterm.js terminal
- loading the fit and web-links addons
- opening the terminal in the DOM
- fitting the terminal to the container
- asking the main process to create the PTY
- sending xterm input to the PTY
- writing PTY output back into xterm
- reacting to terminal title updates
- resizing the PTY when the card changes size
- updating terminal font and resolved theme options from preferences
- supporting copy/paste shortcuts and middle-click paste
- handling per-card theme menu state and inherit-from-workspace behavior
- killing the PTY on unmount

One important implementation detail: PTY creation is intentionally separated from preference, workspace, and clipboard behavior updates so terminal sessions are not torn down by unrelated UI state changes.

## State Model

The Zustand store in `src/renderer/store/index.ts` is the authoritative renderer-side state.

### Stored fields

- `sessions`
- `activeSessionId`
- `maximizedSessionId`
- `layout`
- `themeId`

### Important actions

- `addSession`
- `removeSession`
- `updateSession`
- `setActiveSession`
- `updateLayout`
- `setTheme`
- `restoreWorkspace`
- `toggleMinimizeSession`
- `toggleMaximizeSession`
- `togglePinSession`
- `getWorkspaceSnapshot`

### State behavior notes

- Removing a session also removes its layout item.
- Restoring a workspace recreates sessions from the saved workspace snapshot.
- Minimized sessions stay in state but are omitted from the grid.
- Maximized sessions temporarily replace the grid layout with a single item.
- Pinned sessions stay in state and mark their grid items as non-draggable and non-resizable.
- Sessions can optionally store a `themeId`; if absent, the card inherits the current workspace theme.
- Sessions can optionally store `startupCwd` and `startupCommand`; if absent, the card falls back to the workspace project path.

## UI Layout Model

The card canvas uses `react-grid-layout`.

### Current layout defaults

- `cols = 48`
- `rowHeight = 8`
- `margin = [6, 6]`
- `containerPadding = [8, 8]`
- new cards default to about one-third width and 36 rows tall
- new cards attempt to open to the right of the most recent card before wrapping downward

### Visibility model

- visible sessions render in the grid
- minimized sessions render in the bottom dock
- maximized sessions temporarily replace the grid layout with a single item
- pinned sessions render in place but cannot be dragged or resized

## Theme System

Themes are defined as plain objects in `src/renderer/themes/index.ts`.

The renderer applies themes at two levels:

- a workspace-level `themeId` that controls the app chrome and acts as the default card theme
- an optional session-level `themeId` override that lets a single terminal opt into a different theme

### Built-in themes

`1.1.0` ships with:

- `Sorbet`
- `Midnight Graphite`
- `Dracula`
- `Nord`
- `Tokyo Night`
- `Catppuccin Mocha`
- `Gruvbox Dark`

### Custom themes

Custom themes are plain JSON files placed in the user theme directory. The main process validates them structurally and the renderer merges them after the built-in theme list. Once loaded, they can be used as either workspace themes or per-window overrides.

## Clipboard Model

Clipboard behavior is split between defaults and user overrides.

### Current defaults

- `Cmd/Ctrl+Shift+C` copies the current terminal selection
- `Cmd/Ctrl+Shift+V` pastes into the terminal
- middle-click paste is enabled
- right-click paste is available as an option but disabled by default

### Preference knobs

The preferences file supports:

- `enableClipboardShortcuts`
- `rightClickPaste`
- `middleClickPaste`
- `copyShortcut`
- `pasteShortcut`

Shortcut strings use a simple format such as:

- `CmdOrCtrl+Shift+C`
- `CmdOrCtrl+Shift+V`
- `Ctrl+Alt+C`
- `Alt+V`

## Development Workflow

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Package

```bash
npm run dist:linux:x64
```

```bash
npm run dist:linux:arm64
```

```bash
npm run dist:win
```

### Development notes

- Renderer changes are served live by Vite.
- Main-process changes are recompiled by `tsc --watch`.
- The dev launcher selects a free localhost port and shares it with both Vite and Electron through `SORBET_DEV_PORT`.
- Electron starts only after the renderer server and compiled main files are ready.
- Closing the Electron window ends the full `npm run dev` session.
- Linux release packaging emits `AppImage`, `deb`, and `rpm` artifacts into `release/`.
- Windows installers are built as NSIS `.exe` packages through GitHub Actions.
