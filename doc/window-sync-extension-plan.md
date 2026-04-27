# Window Sync Extension Plan

## Goal

Implement a first version of Chromium page text sync, especially Chinese IME committed text, by loading a temporary Chromium extension with command-line arguments.

## Boundaries

- Native Win32 sync remains responsible for window arrangement, mouse operations, Chromium window actions, shortcuts, and non-text key replay.
- The extension is responsible only for page DOM text state in editable elements.
- The implementation must not use CDP, UI Automation text writes, clipboard writes, foreground-window cycling, or IME state simulation.
- No new npm dependency is introduced; the Electron main process uses Node's built-in `http` module for local coordination.

## Architecture

1. Electron starts a localhost-only sync text bridge.
2. Each browser launch generates a temporary unpacked extension directory under the app data directory.
3. The generated extension contains per-instance config: `envId` and bridge port.
4. `LaunchService` adds `--load-extension=<temporary-extension-dir>` to Chromium launch arguments.
5. Extension content scripts observe committed input state and send snapshots to the background service worker.
6. The background service worker posts snapshots to the local bridge and polls for mirror commands.
7. The bridge accepts snapshots only while window sync is active and only from `mainEnvId`.
8. The bridge queues mirror commands for `mirrorEnvIds`.
9. Mirror extensions poll and apply snapshots inside page context without focusing the mirror OS window.

## Data Shape

Text snapshot commands include:

- `envId`: browser environment that produced the event.
- `url` and `frameUrl`: page context for best-effort matching.
- `selector`: stable-ish selector for the active editable element.
- `kind`: `input`, `textarea`, or `contenteditable`.
- `value`: current committed value/text content.
- `selectionStart` and `selectionEnd`: cursor range when supported.
- `inputType`: browser input event type when available.

## First-Version Limitations

- DOM text sync is best-effort for pages with equivalent DOM structure across environments.
- Complex rich-text editors that virtualize content may need later editor-specific adapters.
- Browser chrome UI text fields are still covered by native key replay, not extension DOM snapshots.

## Verification

- `npm exec vue-tsc --noEmit`
- `npm exec vite build`
- Manual smoke test: launch two environments, start sync, type Chinese in a page `<input>` or `<textarea>` in the main window, confirm mirror window receives committed Chinese text without focus stealing.
