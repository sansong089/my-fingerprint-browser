import { app } from 'electron'
import extractZip from 'extract-zip'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

interface PreparedArtifact {
  pluginId: string
  artifactRelativePath: string
  absolutePath: string
  ready: boolean
  manifest?: {
    name?: string
    version?: string
    description?: string
  }
}

class PluginArtifactService {
  async prepareArtifactFromStore(pluginId: string, storeUrl: string): Promise<PreparedArtifact> {
    const artifactRelativePath = join('plugin-artifacts', pluginId, 'latest')
    const absolutePath = join(app.getPath('userData'), artifactRelativePath)
    const tempRoot = await mkdtemp(join(tmpdir(), `fpb-plugin-${pluginId}-`))
    const tempArchivePath = join(tempRoot, `${pluginId}.zip`)

    try {
      const crxBuffer = await this.downloadCrx(pluginId)
      const zipBuffer = this.extractZipPayload(crxBuffer)

      rmSync(absolutePath, { recursive: true, force: true })
      mkdirSync(absolutePath, { recursive: true })

      await writeFile(tempArchivePath, zipBuffer)
      await extractZip(tempArchivePath, { dir: absolutePath })

      const manifest = this.readManifest(absolutePath)
      this.writeMetadata(absolutePath, {
        pluginId,
        storeUrl,
        downloadedAt: new Date().toISOString(),
        manifest,
      })

      return {
        pluginId,
        artifactRelativePath,
        absolutePath,
        ready: true,
        manifest,
      }
    } catch (error) {
      rmSync(absolutePath, { recursive: true, force: true })
      throw new Error(`Failed to prepare extension artifact for ${pluginId}: ${this.getErrorMessage(error)}`)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }

  resolveAbsolutePath(artifactRelativePath: string): string {
    return join(app.getPath('userData'), artifactRelativePath)
  }

  isArtifactReady(artifactRelativePath: string): boolean {
    return existsSync(join(this.resolveAbsolutePath(artifactRelativePath), 'manifest.json'))
  }

  isAbsoluteArtifactReady(absolutePath: string): boolean {
    return existsSync(join(absolutePath, 'manifest.json'))
  }

  private async downloadCrx(pluginId: string): Promise<Buffer> {
    const response = await fetch(this.buildDownloadUrl(pluginId), {
      redirect: 'follow',
      headers: {
        'user-agent': `Mozilla/5.0 AppleWebKit/537.36 Chrome/${process.versions.chrome || '131.0.0.0'} Safari/537.36`,
      },
    })

    if (!response.ok) {
      throw new Error(`Chrome Web Store download failed with HTTP ${response.status}`)
    }

    const bytes = await response.arrayBuffer()
    return Buffer.from(bytes)
  }

  private buildDownloadUrl(pluginId: string): string {
    const params = new URLSearchParams({
      response: 'redirect',
      prodversion: process.versions.chrome || '131.0.0.0',
      acceptformat: 'crx3',
      x: `id=${pluginId}&installsource=ondemand&uc`,
    })

    return `https://clients2.google.com/service/update2/crx?${params.toString()}`
  }

  private extractZipPayload(archiveBuffer: Buffer): Buffer {
    const magic = archiveBuffer.subarray(0, 4).toString('ascii')
    if (magic !== 'Cr24') {
      return archiveBuffer
    }

    const version = archiveBuffer.readUInt32LE(4)
    let headerSize = 0

    if (version === 2) {
      const publicKeyLength = archiveBuffer.readUInt32LE(8)
      const signatureLength = archiveBuffer.readUInt32LE(12)
      headerSize = 16 + publicKeyLength + signatureLength
    } else if (version === 3) {
      const headerLength = archiveBuffer.readUInt32LE(8)
      headerSize = 12 + headerLength
    } else {
      throw new Error(`Unsupported CRX version ${version}`)
    }

    if (archiveBuffer.length <= headerSize) {
      throw new Error('Downloaded CRX archive is truncated')
    }

    return archiveBuffer.subarray(headerSize)
  }

  private readManifest(absolutePath: string): { name?: string; version?: string; description?: string } {
    const manifestPath = join(absolutePath, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error('Downloaded artifact does not contain manifest.json')
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    return {
      name: typeof manifest.name === 'string' ? manifest.name : undefined,
      version: typeof manifest.version === 'string' ? manifest.version : undefined,
      description: typeof manifest.description === 'string' ? manifest.description : undefined,
    }
  }

  private writeMetadata(absolutePath: string, metadata: Record<string, unknown>): void {
    writeFileSync(join(absolutePath, 'artifact-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8')
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    return String(error)
  }
}

export const pluginArtifactService = new PluginArtifactService()
