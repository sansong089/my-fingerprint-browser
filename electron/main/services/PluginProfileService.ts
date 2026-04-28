import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

interface PluginProfileState {
  suppressedPluginIds: string[]
  lastLaunchedPluginIds?: string[]
  updatedAt: string
}

class PluginProfileService {
  getState(userDataDir: string): PluginProfileState {
    const file = this.getStatePath(userDataDir)
    if (!existsSync(file)) {
      return { suppressedPluginIds: [], lastLaunchedPluginIds: [], updatedAt: new Date().toISOString() }
    }

    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as PluginProfileState
      return {
        suppressedPluginIds: Array.isArray(parsed.suppressedPluginIds) ? parsed.suppressedPluginIds : [],
        lastLaunchedPluginIds: Array.isArray(parsed.lastLaunchedPluginIds) ? parsed.lastLaunchedPluginIds : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      }
    } catch {
      return { suppressedPluginIds: [], lastLaunchedPluginIds: [], updatedAt: new Date().toISOString() }
    }
  }

  saveState(userDataDir: string, state: PluginProfileState): void {
    const file = this.getStatePath(userDataDir)
    mkdirSync(join(userDataDir, 'fpb'), { recursive: true })
    writeFileSync(file, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
  }

  clearState(userDataDir: string): void {
    rmSync(this.getStatePath(userDataDir), { force: true })
  }

  markSuppressed(userDataDir: string, pluginId: string, suppressed: boolean): void {
    const state = this.getState(userDataDir)
    const current = new Set(state.suppressedPluginIds)
    if (suppressed) current.add(pluginId)
    else current.delete(pluginId)
    state.suppressedPluginIds = [...current]
    this.saveState(userDataDir, state)
  }

  clearSuppression(userDataDir: string, pluginId: string): void {
    this.markSuppressed(userDataDir, pluginId, false)
  }

  detectSuppressedFromPreferences(userDataDir: string, desiredPluginIds: string[]): string[] {
    const state = this.getState(userDataDir)
    const currentPrefsIds = this.getPreferenceExtensionIds(userDataDir)
    const suppressed = new Set(state.suppressedPluginIds)
    const previouslyLaunched = new Set(state.lastLaunchedPluginIds || [])

    for (const pluginId of desiredPluginIds) {
      if (previouslyLaunched.has(pluginId) && !currentPrefsIds.has(pluginId)) {
        suppressed.add(pluginId)
      }
    }

    state.suppressedPluginIds = [...suppressed]
    this.saveState(userDataDir, state)
    return state.suppressedPluginIds
  }

  markLaunchedPlugins(userDataDir: string, pluginIds: string[]): void {
    const state = this.getState(userDataDir)
    state.lastLaunchedPluginIds = [...pluginIds]
    this.saveState(userDataDir, state)
  }

  getPreferenceExtensionIds(userDataDir: string): Set<string> {
    const prefsPath = join(userDataDir, 'Default', 'Preferences')
    if (!existsSync(prefsPath)) return new Set()

    try {
      const parsed = JSON.parse(readFileSync(prefsPath, 'utf8')) as any
      const settings = parsed?.extensions?.settings || {}
      return new Set(Object.keys(settings))
    } catch {
      return new Set()
    }
  }

  private getStatePath(userDataDir: string): string {
    return join(userDataDir, 'fpb', 'plugin-local-state.json')
  }
}

export const pluginProfileService = new PluginProfileService()
