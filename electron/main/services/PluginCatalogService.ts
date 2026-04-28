import { storageService, PluginRecord, EnvironmentPluginTarget } from './StorageService'

export interface PluginListItem {
  id: string
  name: string
  version: string
  storeUrl: string
  iconUrl?: string
  targetedEnvCount: number
  installedEnvCount: number
  missingEnvCount: number
  suppressedEnvCount: number
  runningEnvCount: number
  applyNeededEnvIds: string[]
  lastUpdatedAt: string
  description?: string
}

class PluginCatalogService {
  listPlugins(): PluginRecord[] {
    return storageService.getPlugins()
  }

  listTargets(): EnvironmentPluginTarget[] {
    return storageService.getPluginTargets()
  }

  getPlugin(id: string): PluginRecord | undefined {
    return this.listPlugins().find(plugin => plugin.id === id)
  }

  upsertPlugin(plugin: PluginRecord): PluginRecord {
    const existing = this.getPlugin(plugin.id)
    if (existing) {
      storageService.updatePlugin(plugin.id, plugin)
      return { ...existing, ...plugin }
    }
    storageService.addPlugin(plugin)
    return plugin
  }

  assignPluginToAllEnvironments(pluginId: string): EnvironmentPluginTarget[] {
    const environments = storageService.getEnvironments()
    const targets = environments.map(env => {
      const target: EnvironmentPluginTarget = {
        envId: env.id,
        pluginId,
        desiredState: 'installed',
        applyBackend: 'launch-arg',
      }
      storageService.upsertPluginTarget(target)
      return target
    })
    return targets
  }

  inheritPluginsForEnvironment(envId: string): EnvironmentPluginTarget[] {
    const targets: EnvironmentPluginTarget[] = []
    for (const plugin of this.listPlugins()) {
      if (!plugin.inheritToNewEnvironments) continue
      const target: EnvironmentPluginTarget = {
        envId,
        pluginId: plugin.id,
        desiredState: 'installed',
        applyBackend: 'launch-arg',
      }
      storageService.upsertPluginTarget(target)
      targets.push(target)
    }
    return targets
  }

  getTargetsForEnvironment(envId: string): EnvironmentPluginTarget[] {
    return this.listTargets().filter(target => target.envId === envId)
  }

  setTargetInstalled(envId: string, pluginId: string, version?: string): void {
    storageService.upsertPluginTarget({
      envId,
      pluginId,
      desiredState: 'installed',
      applyBackend: 'launch-arg',
      lastAppliedVersion: version,
      lastMaterializedAt: new Date().toISOString(),
    })
  }

  setTargetRemoved(envId: string, pluginId: string): void {
    const existing = this.getTargetsForEnvironment(envId).find(target => target.pluginId === pluginId)
    storageService.upsertPluginTarget({
      envId,
      pluginId,
      desiredState: 'removed',
      applyBackend: existing?.applyBackend || 'launch-arg',
      lastAppliedVersion: existing?.lastAppliedVersion,
      lastMaterializedAt: existing?.lastMaterializedAt,
      lastError: existing?.lastError,
    })
  }

  removePluginEverywhere(pluginId: string): void {
    for (const env of storageService.getEnvironments()) {
      this.setTargetRemoved(env.id, pluginId)
    }
    storageService.deletePlugin(pluginId)
  }

  reconcileMissingTargets(pluginId: string): EnvironmentPluginTarget[] {
    const environments = storageService.getEnvironments()
    const existingTargets = this.listTargets().filter(target => target.pluginId === pluginId)
    const targets: EnvironmentPluginTarget[] = []

    for (const env of environments) {
      const existing = existingTargets.find(target => target.envId === env.id)
      if (!existing || existing.desiredState !== 'installed') {
        const target: EnvironmentPluginTarget = {
          envId: env.id,
          pluginId,
          desiredState: 'installed',
          applyBackend: 'launch-arg',
          lastAppliedVersion: existing?.lastAppliedVersion,
          lastMaterializedAt: existing?.lastMaterializedAt,
          lastError: existing?.lastError,
        }
        storageService.upsertPluginTarget(target)
        targets.push(target)
      }
    }

    return targets
  }

  removeEnvironmentReferences(envId: string): void {
    storageService.deletePluginTargetsForEnvironment(envId)
  }

  buildPluginListItems(options?: { suppressedByEnv?: Record<string, string[]> }): PluginListItem[] {
    const environments = storageService.getEnvironments()
    const runningEnvIds = new Set(environments.filter(env => env.status === 'running').map(env => env.id))
    const suppressedByEnv = options?.suppressedByEnv || {}

    return this.listPlugins().map(plugin => {
      const targets = this.listTargets().filter(target => target.pluginId === plugin.id)
      const targeted = targets.filter(target => target.desiredState === 'installed')
      const removed = targets.filter(target => target.desiredState !== 'installed')
      const suppressedEnvIds = Object.entries(suppressedByEnv)
        .filter(([, ids]) => ids.includes(plugin.id))
        .map(([envId]) => envId)
      const installedEnvCount = Math.max(0, targeted.length - suppressedEnvIds.length)
      return {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        storeUrl: plugin.storeUrl,
        iconUrl: plugin.iconUrl,
        description: plugin.description,
        targetedEnvCount: targeted.length,
        installedEnvCount,
        missingEnvCount: removed.length,
        suppressedEnvCount: suppressedEnvIds.length,
        runningEnvCount: targeted.filter(target => runningEnvIds.has(target.envId)).length,
        applyNeededEnvIds: targeted.filter(target => runningEnvIds.has(target.envId)).map(target => target.envId),
        lastUpdatedAt: plugin.updatedAt,
      }
    })
  }
}

export const pluginCatalogService = new PluginCatalogService()
