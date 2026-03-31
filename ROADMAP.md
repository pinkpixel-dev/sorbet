# Sorbet Roadmap

This document outlines a practical forward-looking roadmap for `Sorbet` after `v1.0.0`.

It is intended to guide product direction, help prioritize development, and give contributors a shared view of where the workspace experience can go next. The roadmap is aspirational rather than a strict promise, and priorities may shift based on user feedback, implementation complexity, and platform constraints.

## Implementation Checklist

Ordered from the strongest foundational work to the heavier expansion features:

- [x] Saved workspaces and layout presets
- [x] Sidebar for saved workspaces
- [x] Window pinning and layout locking
- [x] Per-window themes and color identity
- [x] Session metadata and status
- [x] Commands and command palette
- [x] Workspace templates
- [ ] Project-aware workspaces
- [ ] Workspace actions and startup scripts
- [ ] Browser windows in the workspace
- [ ] Filesystem windows
- [ ] Text editor windows
- [ ] Search across the workspace
- [ ] Environment labels
- [ ] Workspace notes
- [ ] Split and snap assist
- [ ] Import and export
- [ ] Multi-monitor and window sets

## Product Direction

`Sorbet` already provides a strong foundation as a terminal workspace instead of a traditional tabbed terminal. The next stage is to make that workspace feel more intentional, more persistent, and more flexible across different kinds of developer activity.

That direction is especially compelling in a world of CLI agents. As more people run tools like Codex CLI, Claude Code, Gemini CLI, Copilot CLI, Kiro, OpenCode, and similar agent-driven tools in terminals, the value of a multi-session workspace grows quickly. Sorbet can become a control room for agent-based work: terminals are where agents act, and the surrounding workspace helps users monitor, compare, inspect, and verify the results.

The roadmap centers on four themes:

- better workspace persistence
- stronger visual organization
- richer window types beyond terminals
- more powerful workflows without sacrificing the simplicity of the canvas

## Guiding Principles

When evaluating roadmap items, prioritize work that supports these goals:

- Keep the workspace feeling lightweight and fast.
- Preserve the freeform canvas instead of drifting toward a crowded IDE clone.
- Prefer features that improve organization, recall, and continuity between sessions.
- Prefer features that make agent-driven workflows easier to supervise and verify.
- Make advanced behavior optional through preferences rather than mandatory UI complexity.
- Extend the current Electron + preload + renderer architecture cleanly and safely.

## Near-Term Priorities

These items are the strongest candidates for the next phase because they deepen the existing terminal workspace before introducing heavier new card types.

### 1. Saved Workspaces and Layout Presets

Allow users to save and restore named workspace states rather than relying on a single persisted layout.

Status: Implemented.

Potential scope:

- save the current workspace as a named session or layout
- restore a saved workspace later
- duplicate, rename, and delete saved workspaces
- auto-restore the most recent workspace on launch
- optionally choose whether restoring also reopens live terminal sessions or only window placement and metadata

Why it matters:

- turns Sorbet from a transient workspace into a reusable environment
- supports repeatable setups for different projects or tasks
- builds directly on the existing layout persistence model

### 2. Sidebar for Saved Workspaces

Add a lightweight sidebar for browsing and switching between saved workspaces and layouts.

Status: Implemented.

Potential scope:

- collapsible left sidebar
- list of saved workspaces with last-opened timestamps
- quick actions for open, save current as, rename, and delete
- optional favorites or pinned workspaces

Why it matters:

- gives saved workspaces a discoverable home
- improves navigation without replacing the canvas metaphor
- creates a natural place for future navigation features

### 3. Window Pinning and Layout Locking

Let users pin windows to keep them at a fixed size and position when desired.

Status: Implemented.

Potential scope:

- pin a window to disable drag and resize changes
- lock only position, only size, or both
- visual indicator that a card is pinned
- preference for whether pinned cards can still be maximized or minimized

Why it matters:

- helps users maintain deliberate layouts
- reduces accidental movement in dense workspaces
- is especially useful once mixed window types are added

### 4. Per-Window Themes and Color Identity

Allow each terminal window to have its own theme and visual identity.

Potential scope:

- assign a different theme to each terminal window
- optional window border color
- optional colored status dot in the title bar
- preference-driven controls in `preferences.json`
- presets such as "inherit workspace theme" or "custom per window"

Why it matters:

- improves visual separation across concurrent tasks
- makes it easier to recognize environments at a glance
- fits naturally with Sorbet’s existing theming system

### 5. Session Metadata and Status

Improve at-a-glance understanding of each card.

Status: Implemented.

Potential scope:

- activity indicators
- unread output markers
- shell or environment badge
- current working directory display
- status-based color accents

Why it matters:

- makes busy workspaces easier to supervise
- helps users track agent activity without constantly focusing each terminal
- strengthens the workspace model without adding major structural complexity

### 6. Commands and Command Palette

A command palette would make a lot of roadmap functionality easier to access.

Status: Implemented.

Potential scope:

- create or restore workspace
- change theme
- open browser, file explorer, or editor window
- run workspace actions without hunting through menus

Why it matters:

- gives Sorbet a fast control surface as features grow
- reduces menu hunting and keeps the canvas feeling lightweight
- creates a clean entry point for both current and future workspace actions

## Workflow Expansion

These items build on the core workspace model so Sorbet becomes more repeatable, project-aware, and useful for supervising longer-running workflows.

### 7. Workspace Templates

Status: Implemented.

Templates could create predefined layouts for common tasks such as:

- full-stack web development
- server monitoring
- debugging and logs
- documentation writing

Why it matters:

- makes onboarding and repeatability much stronger
- helps users benefit from saved workspaces without setting everything up from scratch
- creates a bridge between persistence and more advanced workflow automation

Implemented scope:

- built-in templates for full-stack work, monitoring, debugging, and documentation writing
- template gallery plus sidebar and command-palette entry points
- save the current workspace as a reusable custom template
- rename and delete custom templates without affecting built-in starters
- create a fresh named workspace from a template without overwriting the current canvas

### 8. Project-Aware Workspaces

Sorbet could detect or associate a workspace with a folder or repository.

Potential directions:

- remember the last workspace used for a given project path
- reopen project-specific terminals in the correct working directory
- suggest matching saved layouts when a folder is opened
- restore the mix of agent terminals, file views, and supporting windows used for that project

Why it matters:

- reduces friction when returning to active repositories
- makes saved workspaces feel contextual rather than generic
- reinforces Sorbet as a project command center instead of a one-off layout tool

### 9. Workspace Actions and Startup Scripts

Let saved workspaces optionally define startup behavior.

Examples:

- open a set of terminals in specific directories
- run common boot commands
- open a localhost URL in a browser card
- restore a docs or notes file in an editor card
- reopen a file tree or changed-file view used to supervise agent output

Why it matters:

- makes saved workspaces operational, not just visual
- is especially compelling for repeatable project setups and agent-driven flows
- compounds the value of persistence, templates, and project-aware behavior

## Mixed Window Types

These items broaden Sorbet from a terminal canvas into a more complete workspace for agent-assisted development and computer use.

### 10. Browser Windows in the Workspace

Allow browser windows to live on the same canvas alongside terminal windows.

Potential scope:

- embeddable browser card with back, forward, reload, and URL bar
- open links inside Sorbet instead of always delegating to the system browser
- project docs, dashboards, localhost apps, and logs visible beside terminals
- per-window navigation history

Why it matters:

- supports real workflows that constantly switch between terminal and browser
- reinforces the core idea of a unified workspace
- creates a strong foundation for documentation, preview, and monitoring use cases
- gives agent-heavy workflows a place to keep docs, previews, dashboards, and local apps visible next to active sessions

Notes:

- This feature needs careful handling around security boundaries, permissions, and navigation rules.
- It may be best to start with a constrained internal browser experience rather than a fully general web browser.

### 11. Filesystem Windows

Add file explorer windows so directories can be opened and browsed inside the workspace.

Potential scope:

- tree or list view for local directories
- open folders in dedicated cards
- quick actions like reveal, copy path, open in terminal, or open file
- drag files from explorer cards into terminal cards where platform support allows
- surface recently changed files so users can quickly inspect what an agent just modified

Why it matters:

- reduces context switching for project navigation
- pairs especially well with saved workspaces
- expands Sorbet into a better project command center without requiring a full IDE
- makes it easier to review files touched by CLI agents without leaving the workspace
- helps users stay oriented in a repository while several agent sessions are active at once

### 12. Text Editor Windows

Allow files to be opened in lightweight editor or file-view windows within the workspace.

Potential scope:

- plain text editing with syntax highlighting
- tabless single-file editor cards
- dirty-state indicator and save commands
- open from filesystem windows or command palette
- lightweight read-only viewing mode for quick inspection after agent-generated changes

Why it matters:

- covers quick edits without leaving Sorbet
- complements terminal-driven workflows
- keeps the product centered on workspace composition rather than deep IDE complexity
- gives users a fast way to inspect, validate, and compare files after an agent edits them
- supports a human-in-the-loop workflow where agent output is visible and reviewable in context

Notes:

- A lightweight editor is likely the right first step.
- Full language tooling should be considered only if it clearly serves the workspace mission.

## Longer-Term Opportunities

These features are promising, but are best pursued after the persistence, workflow, and mixed-window foundation is stronger.

### 13. Search Across the Workspace

Search could eventually span:

- saved workspaces
- open files
- directory cards
- terminal titles and metadata

Why it matters:

- helps users find context quickly once workspaces grow richer
- becomes more valuable as files, browser views, and metadata enter the canvas
- supports agent supervision by making generated output easier to rediscover

### 14. Environment Labels

Allow users to tag windows as `dev`, `staging`, `prod`, `docs`, `logs`, or custom labels.

This would pair nicely with colored borders or dots and make risky contexts easier to recognize.

### 15. Workspace Notes

Add a lightweight notes card for scratch text, TODOs, or runbook reminders.

This could be simpler and more focused than a full editor window while still being very useful.

### 16. Split and Snap Assist

Today Sorbet is intentionally freeform, but optional layout assistance could improve usability.

Potential scope:

- snap windows into common arrangements
- align edges and spacing
- distribute windows evenly
- save these arrangements as templates

### 17. Import and Export

Saved workspaces, themes, and preferences could become portable.

Potential scope:

- export workspace definitions as JSON
- share layout presets between teammates
- import workspace packs for projects or templates

### 18. Multi-Monitor and Window Sets

Over time, Sorbet could support larger workspace orchestration:

- detach groups of cards into separate native windows
- restore layouts across multiple displays
- keep related contexts together across monitors

## Recommended Priority Order

If the goal is to keep momentum high while compounding value cleanly, the best implementation sequence is:

1. persistence and organization foundations: saved workspaces, sidebar, pinning, per-window identity, and session metadata
2. control and repeatability: command palette, templates, project-aware workspaces, and startup actions
3. mixed card types: browser, filesystem, and lightweight editor windows
4. quality-of-life expansion: search, labels, notes, snap assist, import/export, and multi-monitor support

This order strengthens the core product first, then makes it more repeatable, and only after that broadens Sorbet into a richer multi-surface workspace.

## Open Product Questions

These decisions will shape implementation details:

- Should a saved workspace restore live sessions, layout only, or support both modes?
- Should per-window themes be available only for terminals, or for all future card types?
- How much browser functionality is enough before the feature becomes too heavy?
- Should editor windows stay intentionally lightweight, or grow toward IDE-like behavior over time?
- Do pinned windows prevent all movement, or only accidental drag and resize events?

## Summary

The strongest next step for `Sorbet` is to deepen the workspace concept before broadening it. Saved workspaces, a sidebar, pinning, per-window identity, metadata, a command palette, and templates already make the existing terminal canvas substantially more capable. From here, project-aware behavior and startup actions can turn Sorbet into an even more repeatable workflow tool. Once that foundation is solid, browser, filesystem, and editor windows can expand it into a flexible control center for CLI-agent workflows without losing its original character.
