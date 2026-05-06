import { app } from 'electron'
import extractZip from 'extract-zip'
import { createHash } from 'crypto'
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
    const artifactRelativePath = join('ext', pluginId)
    const absolutePath = join(app.getPath('userData'), artifactRelativePath)
    const tempRoot = await mkdtemp(join(tmpdir(), `fpb-plugin-${pluginId}-`))
    const tempArchivePath = join(tempRoot, `${pluginId}.zip`)

    try {
      const crxBuffer = await this.downloadCrx(pluginId)
      const publicKey = this.extractPublicKey(crxBuffer, pluginId)
      const zipBuffer = this.extractZipPayload(crxBuffer)

      rmSync(absolutePath, { recursive: true, force: true })
      mkdirSync(absolutePath, { recursive: true })

      await writeFile(tempArchivePath, zipBuffer)
      await extractZip(tempArchivePath, { dir: absolutePath })

      const manifest = this.readManifest(absolutePath, publicKey)
      this.writeMetadata(absolutePath, {
        pluginId,
        storeUrl,
        downloadedAt: new Date().toISOString(),
        keyInjected: Boolean(publicKey),
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

  private extractPublicKey(archiveBuffer: Buffer, expectedPluginId: string): string | undefined {
    const magic = archiveBuffer.subarray(0, 4).toString('ascii')
    if (magic !== 'Cr24') return undefined

    const version = archiveBuffer.readUInt32LE(4)
    if (version === 2) {
      const publicKeyLength = archiveBuffer.readUInt32LE(8)
      if (archiveBuffer.length < 16 + publicKeyLength) return undefined
      const publicKey = archiveBuffer.subarray(16, 16 + publicKeyLength)
      return this.getExtensionIdForPublicKey(publicKey) === expectedPluginId
        ? publicKey.toString('base64')
        : undefined
    }

    if (version !== 3) return undefined

    const headerLength = archiveBuffer.readUInt32LE(8)
    const headerStart = 12
    const headerEnd = headerStart + headerLength
    if (archiveBuffer.length < headerEnd) return undefined

    return this.extractCrx3PublicKey(archiveBuffer.subarray(headerStart, headerEnd), expectedPluginId)
  }

  private extractCrx3PublicKey(header: Buffer, expectedPluginId: string): string | undefined {
    let offset = 0
    while (offset < header.length) {
      const key = this.readVarint(header, offset)
      if (!key) return undefined
      offset = key.nextOffset

      const fieldNumber = Number(key.value >> 3n)
      const wireType = Number(key.value & 7n)
      if (wireType !== 2) {
        const skipped = this.skipProtobufField(header, offset, wireType)
        if (skipped === undefined) return undefined
        offset = skipped
        continue
      }

      const length = this.readVarint(header, offset)
      if (!length) return undefined
      offset = length.nextOffset
      const end = offset + Number(length.value)
      if (end > header.length) return undefined

      if (fieldNumber === 2 || fieldNumber === 3) {
        const publicKey = this.extractProofPublicKey(header.subarray(offset, end))
        if (publicKey && this.getExtensionIdForPublicKey(publicKey) === expectedPluginId) {
          return publicKey.toString('base64')
        }
      }

      offset = end
    }

    return undefined
  }

  private extractProofPublicKey(proof: Buffer): Buffer | undefined {
    let offset = 0
    while (offset < proof.length) {
      const key = this.readVarint(proof, offset)
      if (!key) return undefined
      offset = key.nextOffset

      const fieldNumber = Number(key.value >> 3n)
      const wireType = Number(key.value & 7n)
      if (wireType !== 2) {
        const skipped = this.skipProtobufField(proof, offset, wireType)
        if (skipped === undefined) return undefined
        offset = skipped
        continue
      }

      const length = this.readVarint(proof, offset)
      if (!length) return undefined
      offset = length.nextOffset
      const end = offset + Number(length.value)
      if (end > proof.length) return undefined

      if (fieldNumber === 1) {
        return proof.subarray(offset, end)
      }

      offset = end
    }

    return undefined
  }

  private getExtensionIdForPublicKey(publicKey: Buffer): string {
    const hash = createHash('sha256').update(publicKey).digest().subarray(0, 16)
    return [...hash]
      .map(byte => String.fromCharCode(97 + ((byte >> 4) & 0x0f)) + String.fromCharCode(97 + (byte & 0x0f)))
      .join('')
  }

  private readVarint(buffer: Buffer, offset: number): { value: bigint; nextOffset: number } | undefined {
    let value = 0n
    let shift = 0n
    let currentOffset = offset

    while (currentOffset < buffer.length) {
      const byte = buffer[currentOffset++]
      value |= BigInt(byte & 0x7f) << shift
      if ((byte & 0x80) === 0) {
        return { value, nextOffset: currentOffset }
      }
      shift += 7n
      if (shift > 63n) return undefined
    }

    return undefined
  }

  private skipProtobufField(buffer: Buffer, offset: number, wireType: number): number | undefined {
    if (wireType === 0) {
      return this.readVarint(buffer, offset)?.nextOffset
    }

    if (wireType === 1) {
      const next = offset + 8
      return next <= buffer.length ? next : undefined
    }

    if (wireType === 2) {
      const length = this.readVarint(buffer, offset)
      if (!length) return undefined
      const next = length.nextOffset + Number(length.value)
      return next <= buffer.length ? next : undefined
    }

    if (wireType === 5) {
      const next = offset + 4
      return next <= buffer.length ? next : undefined
    }

    return undefined
  }

  private readManifest(absolutePath: string, publicKey?: string): { name?: string; version?: string; description?: string } {
    const manifestPath = join(absolutePath, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error('Downloaded artifact does not contain manifest.json')
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    if (publicKey && typeof manifest.key !== 'string') {
      manifest.key = publicKey
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    }

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
