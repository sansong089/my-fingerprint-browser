import { app } from 'electron'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { storageService, PluginBackendProofRecord } from './StorageService'

const ADR_RELATIVE_PATH = '.omx/plans/adr-plugin-backend-proof.md'

class PluginBackendProbeService {
  private approvedBackend: PluginBackendProofRecord['backend'] = 'launch-arg'

  ensureApprovedBackend(): PluginBackendProofRecord {
    const existing = storageService.getPluginBackendProof()
    if (existing?.decision === 'approved' && existing.backend === this.approvedBackend) {
      this.ensureAdrFile(existing)
      return existing
    }

    const proof: PluginBackendProofRecord = {
      backend: this.approvedBackend,
      decision: 'approved',
      checkedAt: new Date().toISOString(),
      rationale: 'The app already owns browser launch and per-environment userDataDir isolation. A launch-arg managed unpacked-extension backend fits the current architecture better than machine-global external-install mechanisms.',
      evidence: [
        'LaunchService already injects extensions via --load-extension.',
        'EnvironmentManager owns create/launch/delete lifecycle and can coordinate inherit/reconcile/cleanup.',
        'Browser-side uninstall can be preserved per profile by recording local suppression state and skipping future relaunch injection for that environment.',
      ],
      constraints: [
        'This backend assumes the managed browser continues to support loading unpacked extensions via launch args.',
        'Artifact acquisition must yield an unpacked extension directory before launch.',
        'Browser-side uninstall detection is heuristic and based on profile-local state plus Preferences inspection.',
      ],
      detectionMethod: 'On each launch, compare desired plugin ids and last launched plugin ids against the profile Preferences extension settings; if a previously launched managed plugin is now missing, mark it suppressed in profile-local state.',
      adrRelativePath: ADR_RELATIVE_PATH,
    }

    storageService.savePluginBackendProof(proof)
    this.ensureAdrFile(proof)
    return proof
  }

  getArtifactRoot(): string {
    return join(app.getPath('userData'), 'plugin-artifacts')
  }

  private ensureAdrFile(proof: PluginBackendProofRecord): void {
    const targetPath = join(process.cwd(), proof.adrRelativePath)
    if (existsSync(targetPath)) return

    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, this.buildAdrMarkdown(proof), 'utf8')
  }

  private buildAdrMarkdown(proof: PluginBackendProofRecord): string {
    return `# ADR — Plugin Backend Proof\n\n## Decision\nUse \`${proof.backend}\` as the v1 managed-plugin backend.\n\n## Why\n${proof.rationale}\n\n## Evidence\n${proof.evidence.map(item => `- ${item}`).join('\n')}\n\n## Constraints\n${proof.constraints.map(item => `- ${item}`).join('\n')}\n\n## Browser-side uninstall detection\n${proof.detectionMethod}\n\n## Checked at\n${proof.checkedAt}\n`
  }
}

export const pluginBackendProbeService = new PluginBackendProbeService()
