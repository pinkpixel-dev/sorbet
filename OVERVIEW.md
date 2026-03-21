# Technical Overview and Development Guide

## Purpose

This document is intended to help developers understand how `Sorbet` is structured, how the runtime pieces communicate, and where to make changes when extending the project.

The application is a desktop terminal workspace built on Electron. It combines:

- a privileged Electron main process
- a secure preload bridge
- a React renderer UI
- PTY-backed shell processes

The design keeps process management and persistence in the main process while the renderer remains focused on UI state, layout, and terminal presentation.

## System Overview

The runtime is composed of four major layers:

1. Electron main process
2. Electron preload bridge
3. React renderer
4. PTY shell sessions

### Runtime flow

1. Electron launches and creates the main window.
2. The renderer loads either from the Vite dev server or the built renderer bundle.
3. The renderer calls `window.sorbet.store.getTheme()` and `window.sorbet.store.getLayout()` during startup.
4. If a saved layout exists, the Zustand store reconstructs the workspace from it.
5. If no layout exists, the renderer creates one initial terminal session.
6. Each `TerminalCard` mounts xterm.js and asks the main process to spawn a PTY.
7. Input from xterm.js is forwarded to the PTY over IPC.
8. Output from the PTY is streamed back to the card over IPC.
9. Layout and theme changes are persisted with `electron-store`.

## Directory Guide

### `src/main`

This directory contains the Electron main process and preload bridge.

- `main.ts`
  - creates the `BrowserWindow`
  - configures Electron lifecycle behavior
  - selects and spawns shell processes with `node-pty`
  - owns the PTY session map
  - forwards PTY output and exit events to the renderer
  - persists layout and theme state via `electron-store`
- `preload.ts`
  - defines the safe API exposed to the renderer as `window.sorbet`
  - wraps all PTY and store IPC calls

### `src/renderer`

This directory contains the UI and renderer-side app state.

- `App.tsx`
  - top-level application shell
  - workspace initialization
  - keyboard shortcut handling
  - theme selection
  - grid layout configuration
  - minimized-session dock
- `components/TerminalCard.tsx`
  - xterm.js lifecycle
  - PTY creation and teardown
  - input/output wiring
  - title editing
  - card window controls
- `components/ThemePicker.tsx`
  - theme dropdown UI
- `store/index.ts`
  - Zustand store for sessions, theme, active state, and layout
- `themes/index.ts`
  - theme catalog
- `types/index.ts`
  - renderer-side shared types and `window.sorbet` typing

### Supporting files

- `vite.config.ts`
  - Vite configuration for the renderer build and dev server
- `scripts/start-electron.cjs`
  - helper script that launches Electron with the correct environment in development
- `tsconfig.json`
  - renderer TypeScript configuration
- `tsconfig.main.json`
  - main-process TypeScript configuration

## Main Process Design

The main process is the trust boundary for anything that requires Node.js or native access.

### Responsibilities

- native window creation
- platform-specific shell resolution
- PTY process lifecycle
- persistence via `electron-store`
- secure handling of external links

### Window lifecycle

The main window is created hidden and shown only after `ready-to-show`. This reduces visual flicker during startup. The window is configured with:

- `contextIsolation: true`
- `nodeIntegration: false`
- a preload script

That combination keeps the renderer sandboxed while still giving it a curated API surface.

### PTY management

PTY sessions are stored in a `Map<string, PtySession>`. Each session contains:

- the `node-pty` instance
- the renderer-facing session ID

The main process exposes IPC handlers/events for:

- `pty:create`
- `pty:write`
- `pty:resize`
- `pty:kill`

On process exit, the session is removed from the map and an exit event is pushed back to the renderer.

### Shell resolution

The shell selection logic prefers:

1. `SORBET_SHELL`
2. common Bash/Zsh paths
3. `process.env.SHELL`
4. `/bin/sh`

Windows uses `powershell.exe`.

Interactive shells are launched with `-i` when appropriate so users get their normal interactive shell behavior and startup files.

### Persistence

The app currently stores:

- `layout`
- `theme`

These are written with `electron-store` in the main process and consumed by the renderer through the preload bridge.

## Preload Bridge Design

The preload script exposes a small API under `window.sorbet`.

### Exposed namespaces

- `window.sorbet.pty`
  - `create(sessionId, cols, rows)`
  - `write(sessionId, data)`
  - `resize(sessionId, cols, rows)`
  - `kill(sessionId)`
  - `onData(sessionId, callback)`
  - `onExit(sessionId, callback)`
- `window.sorbet.store`
  - `getLayout()`
  - `saveLayout(layout)`
  - `getTheme()`
  - `saveTheme(theme)`

### Why this matters

This pattern keeps Electron-specific details out of the UI layer and helps the renderer stay testable and portable in principle. If new privileged operations are added later, they should be routed through this bridge rather than exposing direct Node access to the renderer.

## Renderer Design

The renderer is responsible for translating application state into the terminal workspace UI.

### `App.tsx`

`App.tsx` owns the top-level orchestration of the workspace.

Key responsibilities:

- restoring persisted workspace state on first load
- creating a default terminal when there is no saved layout
- managing the grid width for `react-grid-layout`
- autosaving layout changes
- handling theme changes
- binding `Cmd/Ctrl+T` for new sessions
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
- killing the PTY on unmount

Because card mount/unmount controls PTY lifecycle, any future virtualization or offscreen rendering changes should be designed carefully to avoid killing sessions unexpectedly.

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

### State behavior notes

- Removing a session also removes its layout item.
- Restoring a workspace recreates sessions from saved layout items.
- Minimized sessions stay in state but are omitted from the grid.
- Maximizing a session swaps the grid layout to a single full-width item.

One implementation detail worth noting: `restoreWorkspace` recreates sessions using `Date.now()` at restore time, so `createdAt` reflects restoration time rather than the original session creation time.

## UI Layout Model

The card canvas uses `react-grid-layout`.

### Current layout defaults

- `cols = 12`
- `rowHeight = 30`
- `margin = [6, 6]`
- `containerPadding = [8, 8]`
- new cards default to approximately half-width and 8 rows tall

### Visibility model

- visible sessions render in the grid
- minimized sessions render in the bottom dock
- maximized sessions temporarily replace the grid layout with a single item

This is a clean and simple model, but changes to layout persistence should take care not to store temporary maximize-only layout substitutions.

## Theme System

Themes are defined as plain objects in `src/renderer/themes/index.ts`.

Each theme includes:

- terminal colors for xterm.js
- a display name
- an `accent` color for UI controls and highlights

Adding a new theme is straightforward:

1. add the theme object
2. give it a unique `id`
3. make sure all xterm color fields are present
4. verify the dropdown renders it correctly

## Development Workflow

### Install

```bash
npm install
```

### Run locally

```bash
npm start
```

### Build

```bash
npm run build
```

### Package

```bash
npx electron-builder
```

### Development process notes

- Renderer changes are served live by Vite.
- Main-process changes are recompiled by `tsc --watch`.
- Electron starts only after the renderer server and compiled main files are ready.

If you are changing preload APIs or main-process IPC contracts, restart Electron after the relevant output has recompiled so the updated bridge is loaded.

## Common Change Scenarios

### Add a new persisted preference

1. Add IPC handlers in `src/main/main.ts`.
2. Expose the new methods in `src/main/preload.ts`.
3. Extend the `SorbetAPI` type in `src/renderer/types/index.ts`.
4. Consume the new methods from React or Zustand.

### Add terminal controls

Most terminal card interactions belong in `src/renderer/components/TerminalCard.tsx`. If the control requires privileged behavior, pair the UI change with new preload and main-process support.

### Change startup behavior

Startup restoration and default-session creation are implemented in `src/renderer/App.tsx`. Window behavior is controlled in `src/main/main.ts`.

### Change shell startup behavior

Shell resolution and spawn options are defined in `src/main/main.ts`. That is the correct place to add environment shaping, custom shell flags, or platform-specific process logic.

## Debugging Notes

### PTY does not start

Check:

- native `node-pty` build status
- local shell availability
- whether `SORBET_SHELL` points to a valid executable

If needed:

```bash
npm rebuild node-pty
```

### Terminal content does not fit card size

The resize path depends on:

- `ResizeObserver` in `TerminalCard`
- xterm.js `FitAddon`
- `window.sorbet.pty.resize(...)`

If layout changes but terminal rows/columns do not update, inspect that flow first.

### Renderer loads but Electron behaviors fail

This often points to one of these issues:

- preload output is stale
- Electron was not restarted after main/preload changes
- the IPC contract changed on one side but not the other

## Known Gaps

- No automated tests are configured yet
- No linting configuration is present
- Packaging is manual via `npx electron-builder`
- Dist output is committed in the workspace snapshot provided here

## Recommended Next Improvements

- add automated tests for store behavior and renderer interactions
- add linting and formatting enforcement
- add explicit packaging scripts in `package.json`
- document electron-builder packaging targets
- consider persisting more workspace metadata, such as terminal titles

## Licensing

The project is licensed under Apache License 2.0. Keep in mind that bundled dependencies retain their own licenses, so distributable builds should include third-party license review as part of release preparation.
