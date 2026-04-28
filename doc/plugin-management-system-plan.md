# Plugin Management System Plan

## Status

- **Scope**: v1 app-managed browser plugin installation for managed Chromium environments.
- **Current state**: **not implemented yet in this branch**.
- **Hard gate**: no implementation should merge until Step 0 backend proof/ADR shows that the chosen backend works with custom `userDataDir`, survives relaunch, and preserves browser-side uninstall as a profile-local exception.

## Brownfield fit review

The current codebase already exposes the right seams for a plugin-management feature, but it also has a few important traps that reviewers should enforce:

1. **Environment isolation is real and must stay real**
   - `EnvironmentManager` creates one `userDataDir` per environment and owns lifecycle orchestration.
   - A plugin backend must not collapse all environments onto one shared live extension directory.
2. **Launch-time extension loading is currently single-purpose**
   - `LaunchService` only injects the sync extension today via one `--load-extension=...` argument.
   - Reviewers should reject implementations that overwrite the sync extension path or assume hot injection.
3. **Persistent state is centralized but plugin entities do not exist yet**
   - `StorageService` is the existing persistence authority.
   - Adding plugin state must preserve backward-compatible defaults for existing installs.
4. **Renderer wiring is explicit, not inferred**
   - A new feature must update router, sidebar navigation, Vuex module registration, and exported types together.
5. **IPC validation currently has an allow-by-default gap**
   - `IPCValidator` passes channels without a schema.
   - Every mutating plugin IPC channel must add explicit validation coverage.

## Step 0 backend proof gate (required before feature code)

A candidate backend only passes if one real extension can be installed into **two** environments and all of the following stay true:

1. install intent remains app-global;
2. browser-side uninstall in environment A stays local after relaunch;
3. environment B remains installed;
4. explicit app-side reinstall repairs only the missing/suppressed environment;
5. no shared active-state leak appears across unrelated environments.

### Required ADR evidence

Before implementation is considered ready, the branch should include a short ADR or proof note that records:

- the candidate backend that was tested;
- accepted vs rejected alternatives;
- exact reproduction steps;
- filesystem/profile evidence used to confirm local uninstall persistence;
- why the chosen backend does not break the existing sync-extension launch path.

### Immediate no-go signals

Reject the backend if any of the following happens:

- the plugin reappears automatically after browser-side uninstall without an explicit app reinstall;
- the backend requires machine-global policy that bypasses per-environment isolation;
- the backend cannot survive relaunch under a custom `userDataDir`;
- the only working approach forces the app to remove or replace the existing sync extension injection path.

## Implementation review checklist

### Storage and types

- Add `plugins` and `pluginTargets` defaults in `electron/main/services/StorageService.ts`.
- Mirror plugin types under `src/types/` and re-export them through `src/types/index.ts` and `src/store/index.ts`.
- Keep profile-local suppression data out of app-global storage.

### Main-process services

- Keep storage CRUD, artifact management, per-profile state, and install orchestration in separate services.
- Log install/uninstall/reconcile operations through `ActivityLogService`.
- Do not fold plugin management into `SyncExtensionService`.

### Environment lifecycle integration

- New environments must inherit app-installed plugin targets before first launch.
- Launch reconcile must happen before browser spawn.
- Environment deletion must clean up both app-side targets and profile-local plugin metadata.

### LaunchService constraints

- Preserve the sync extension.
- If the proven backend still uses `--load-extension`, combine paths intentionally instead of replacing the existing argument.
- Keep launch-time reconcile idempotent; do not assume a running browser can be patched in place for v1.

### IPC and renderer shell

- Add validator schemas for every mutating plugin channel.
- Reuse preload `invoke()` instead of adding bespoke preload wrappers.
- Add `/plugins` route, sidebar entry, and a namespaced Vuex module together.
- Use the existing in-app confirmation patterns (for example `ConfirmDialog.vue`), not `window.confirm`.

## Documentation expectations for the implementation branch

When feature code lands, documentation should be updated in the same change set to include:

- chosen backend + ADR link;
- plugin data model summary;
- app-side install/uninstall semantics;
- browser-side uninstall local-suppression semantics;
- restart/reconcile expectations for running environments;
- verification evidence from typecheck, build, tests, and the Step 0 manual proof.

## Suggested verification for this feature

- `npm exec vue-tsc --noEmit`
- `npm run build`
- focused tests for storage/catalog/install/profile services
- manual two-environment proof for local uninstall persistence
