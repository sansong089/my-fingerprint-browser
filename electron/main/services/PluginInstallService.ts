import { activityLogService } from '../managers/ActivityLogService'
import { storageService, PluginRecord } from './StorageService'
import { pluginArtifactService } from './PluginArtifactService'
import { pluginBackendProbeService } from './PluginBackendProbeService'
import { pluginCatalogService } from './PluginCatalogService'
import { pluginProfileService } from './PluginProfileService'

interface InstallPayload {
  storeUrl: string
  name?: string
  iconUrl?: string
  description?: string
}

interface LaunchContext {
  extensionDirs: string[]
  suppressedPluginIds: string[]
  desiredPluginIds: string[]
}

class PluginInstallService {
  ensureBackendProof() {
    return pluginBackendProbeService.ensureApprovedBackend()
  }

  async installFromStore(payload: InstallPayload): Promise<PluginRecord> {
    this.ensureBackendProof()
    const pluginId = this.extractPluginId(payload.storeUrl)
    const artifact = await pluginArtifactService.prepareArtifactFromStore(pluginId, payload.storeUrl)
    const now = new Date().toISOString()

    const plugin: PluginRecord = {
      id: pluginId,
      name: this.resolveDisplayName(payload.name, artifact.manifest?.name, pluginId),
      storeUrl: payload.storeUrl,
      source: 'chrome-web-store',
      version: artifact.manifest?.version || 'unknown',
      iconUrl: payload.iconUrl,
      description: payload.description || artifact.manifest?.description,
      artifactRelativePath: artifact.artifactRelativePath,
      inheritToNewEnvironments: true,
      installedByAppAt: now,
      updatedAt: now,
      backend: 'launch-arg',
    }

    const existing = pluginCatalogService.getPlugin(pluginId)
    const saved = pluginCatalogService.upsertPlugin(plugin)

    if (existing) {
      pluginCatalogService.reconcileMissingTargets(pluginId)
    } else {
      pluginCatalogService.assignPluginToAllEnvironments(pluginId)
    }

    this.clearSuppressionEverywhere(pluginId)

    activityLogService.log({
      envId: 'system',
      action: existing ? 'update' : 'create',
      details: `${existing ? 'Reconcile plugin' : 'Install plugin'}: ${saved.name} (${saved.id})`,
    })

    return saved
  }

  uninstallFromApp(pluginId: string): void {
    const plugin = pluginCatalogService.getPlugin(pluginId)
    if (!plugin) return

    pluginCatalogService.removePluginEverywhere(pluginId)
    this.clearSuppressionEverywhere(pluginId)

    activityLogService.log({
      envId: 'system',
      action: 'delete',
      details: `Uninstall plugin from app: ${plugin.name} (${plugin.id})`,
    })
  }

  reinstallMissingOnly(pluginId: string): void {
    const plugin = pluginCatalogService.getPlugin(pluginId)
    if (!plugin) return

    pluginCatalogService.reconcileMissingTargets(pluginId)
    this.clearSuppressionEverywhere(pluginId)

    activityLogService.log({
      envId: 'system',
      action: 'update',
      details: `Reinstall missing plugin targets: ${plugin.name} (${plugin.id})`,
    })
  }

  getLaunchContextForEnvironment(envId: string, userDataDir: string): LaunchContext {
    this.ensureBackendProof()
    const targets = pluginCatalogService.getTargetsForEnvironment(envId).filter(target => target.desiredState === 'installed')
    const desiredPluginIds = targets.map(target => target.pluginId)
    const suppressedPluginIds = pluginProfileService.detectSuppressedFromPreferences(userDataDir, desiredPluginIds)
    const extensionDirs = targets
      .filter(target => !suppressedPluginIds.includes(target.pluginId))
      .map(target => pluginCatalogService.getPlugin(target.pluginId))
      .filter((plugin): plugin is PluginRecord => !!plugin)
      .map(plugin => pluginArtifactService.resolveAbsolutePath(plugin.artifactRelativePath))
      .filter(dir => pluginArtifactService.isAbsoluteArtifactReady(dir))

    pluginProfileService.markLaunchedPlugins(userDataDir, targets.map(target => target.pluginId).filter(pluginId => !suppressedPluginIds.includes(pluginId)))

    return { extensionDirs, suppressedPluginIds, desiredPluginIds }
  }

  getSuppressedByEnvironment(): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const env of storageService.getEnvironments()) {
      result[env.id] = pluginProfileService.getState(env.userDataDir).suppressedPluginIds
    }
    return result
  }

  cleanupEnvironment(envId: string, userDataDir: string): void {
    pluginCatalogService.removeEnvironmentReferences(envId)
    pluginProfileService.clearState(userDataDir)
  }

  private extractPluginId(storeUrl: string): string {
    const match = storeUrl.match(/\/detail\/[^/]+\/([a-z]{32})(?:[/?#]|$)/i)
    if (!match) {
      throw new Error('Unsupported Chrome Web Store URL')
    }
    return match[1].toLowerCase()
  }

  private clearSuppressionEverywhere(pluginId: string): void {
    for (const env of storageService.getEnvironments()) {
      pluginProfileService.clearSuppression(env.userDataDir, pluginId)
    }
  }

  private resolveDisplayName(preferredName: string | undefined, manifestName: string | undefined, pluginId: string): string {
    if (preferredName?.trim()) return preferredName.trim()
    if (manifestName && !manifestName.startsWith('__MSG_')) return manifestName
    return `Plugin ${pluginId.slice(0, 6)}`
  }
}

export const pluginInstallService = new PluginInstallService()
