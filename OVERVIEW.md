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
4. If a saved workspace exists, the Zustand store reconstructs the current workspace snapshot from it.
5. If no saved workspace exists, the renderer creates one initial terminal session.
6. Each `TerminalCard` mounts xterm.js and asks the main process to spawn a PTY.
7. Input from xterm.js is forwarded to the PTY over IPC.
8. Output from the PTY is streamed back to the card over IPC.
9. Layout, saved-workspace, workspace-theme, and per-window theme changes are persisted through `electron-store`.
10. The command palette builds a searchable list of actions from live renderer state so users can switch workspaces, change themes, and jump between sessions quickly.
11. Preference and custom-theme changes are detected in the main process and pushed back to the renderer over a lightweight config-change event.
12. Packaged builds load the bundled renderer based on `app.isPackaged` rather than environment variables.

## Directory Guide

### `src/main`

This directory contains the Electron main process and preload bridge.

- `main.ts`
  - creates the `BrowserWindow`
  - configures Electron lifecycle behavior
  - selects and spawns shell processes with `node-pty`
  - owns the PTY session map
  - forwards PTY output and exit events to the renderer
  - persists saved workspaces, layout snapshots, selected workspace theme, and per-window theme overrides
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
  - command palette command generation and keyboard shortcuts
  - grid layout configuration
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
  - development orchestrator that picks an available port, starts the renderer and TypeScript watchers, and then launches Electron with the same environment
- `scripts/start-electron.cjs`
  - helper script that launches Electron with the correct environment in development
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

For `v1.0.0`, packaged builds use `app.isPackaged` to decide whether to load the active local dev server or the bundled renderer assets. In development, the shared dev-server port comes from `SORBET_DEV_PORT`, which prevents Electron and Vite from drifting out of sync when a default port is already occupied.

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
  - `theme`
- JSON files in Electron `userData` for:
  - `preferences.json`
  - `themes/*.json`

The preferences file is intentionally human-editable and includes an ignored `_template` section with inline guidance. The custom theme directory is watched and valid theme files are added to the renderer theme list automatically. Workspace snapshots carry the selected workspace theme plus any session-level `themeId` overrides.

## Preload Bridge Design

The preload script exposes a small API under `window.sorbet`.

### Exposed namespaces

- `window.sorbet.platform`
- `window.sorbet.clipboard`
  - `readText()`
  - `writeText(text)`
- `window.sorbet.pty`
  - `create(sessionId, cols, rows)`
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
  - `createWorkspace(name, snapshot, makeCurrent?)`
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
- loading user preferences and custom themes
- creating a default terminal when there is no saved layout
- managing the grid width for `react-grid-layout`
- autosaving layout changes
- autosaving the current workspace snapshot
- handling workspace theme changes
- resolving per-window theme overrides against the available theme catalog
- binding `Cmd/Ctrl+T` for new sessions
- rendering the workspace sidebar and naming dialog
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

`1.0.0` ships with:

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
