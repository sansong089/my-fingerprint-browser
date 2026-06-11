export interface PluginRecord {
  id: string
  name: string
  storeUrl: string
  source: 'chrome-web-store'
  version: string
  iconUrl?: string
  description?: string
  artifactRelativePath: string
  inheritToNewEnvironments: boolean
  installedByAppAt: string
  updatedAt: string
  backend: 'launch-arg'
}

export interface EnvironmentPluginTarget {
  envId: string
  pluginId: string
  applyBackend?: 'launch-arg' | 'profile-external' | 'proven-other'
  lastAppliedVersion?: string
  lastMaterializedAt?: string
  lastError?: string
}

export interface PluginBackendProofRecord {
  backend: 'launch-arg'
  decision: 'approved'
  checkedAt: string
  rationale: string
  evidence: string[]
  constraints: string[]
  detectionMethod: string
  adrRelativePath: string
}

export interface PluginListItem {
  id: string
  name: string
  version: string
  storeUrl: string
  iconUrl?: string
  targetedEnvCount: number
  runningEnvCount: number
  applyNeededEnvIds: string[]
  lastUpdatedAt: string
  description?: string
}

export interface PluginInstallPayload {
  storeUrl: string
  name?: string
  iconUrl?: string
  description?: string
}
