/**
 * ExportImportService — 环境导入导出服务
 *
 * 导出：将环境配置、Profile 目录、插件打包为 ZIP
 * 导入：从 ZIP 解压并创建新环境
 *
 * Cookie 加密：
 * - 导出时用用户密码加密 cookie
 * - 导入时用用户密码解密 cookie
 */
import { app } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv, type CipherGCM, type DecipherGCM } from 'crypto'
import extractZip from 'extract-zip'
import { mkdtemp, rm, writeFile, readdir, stat, copyFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { storageService, Environment, PluginRecord, EnvironmentPluginTarget } from './StorageService'
import { pluginCatalogService } from './PluginCatalogService'
import { pluginArtifactService } from './PluginArtifactService'
import { cookieFileService, type CookieData } from './CookieFileService'
import { activityLogService } from '../managers/ActivityLogService'

// 排除的加密文件（需要特殊处理）
const ENCRYPTED_FILES = [
  'Cookies',
  'Cookies-journal',
  'Login Data',
  'Login Data-journal',
  'Web Data',
  'Web Data-journal',
]

// 排除的目录和文件模式（不区分大小写）
const EXCLUDE_PATTERNS_LOWERCASE = [
  'cache',
  'code cache',
  'lockfile',
  'lock',
  '.lock',
  'log',    // Chrome SQLite WAL 日志文件
  'log.old',
]

// 排除的日志文件扩展名（不区分大小写）
const LOG_EXTENSIONS_LOWERCASE = ['.log']

// Cookie 加密配置
const COOKIE_ENCRYPTION = {
  algorithm: 'aes-256-gcm',
  keyDerivation: 'pbkdf2',
  iterations: 100000,
  saltLength: 16,
  ivLength: 12,
  authTagLength: 16,
}

interface ExportManifest {
  version: number
  exportedAt: string
  encryption: {
    algorithm: string
    keyDerivation: string
    iterations: number
  }
  environments: ExportEnvironment[]
  plugins: ExportPlugin[]
}

interface ExportEnvironment {
  id: string
  name: string
  fingerprint: any
  proxy?: any
  tags: string[]
  color: string
  groupId?: string
  profileDir: string
  cookieFile: string
  pluginIds: string[]
}

interface ExportPlugin {
  id: string
  name: string
  version: string
  artifactDir: string
}

interface ImportResult {
  environments: { id: string; name: string }[]
  plugins: { id: string; name: string; skipped: boolean }[]
}

class ExportImportService {
  /**
   * 导出环境为 ZIP 文件
   */
  async exportEnvironments(envIds: string[], outputPath: string, cookiePassword?: string): Promise<string> {
    console.log('[ExportImportService] ===== exportEnvironments START =====')
    console.log('[ExportImportService] exportEnvironments called with:', { envIds, outputPath, hasPassword: !!cookiePassword })
    
    if (!Array.isArray(envIds) || envIds.length === 0) {
      throw new Error('No environments selected for export')
    }

    const allEnvs = storageService.getEnvironments()
    const envsToExport = allEnvs.filter(e => envIds.includes(e.id))
    console.log('[ExportImportService] Environments to export:', envsToExport.length)

    // 检查是否有运行中的环境
    const runningEnvs = envsToExport.filter(e => e.status === 'running')
    if (runningEnvs.length > 0) {
      throw new Error(`Cannot export running environments: ${runningEnvs.map(e => e.name).join(', ')}`)
    }

    // 创建临时目录
    const tempDir = await mkdtemp(join(tmpdir(), 'fpb-export-'))

    try {
      // 收集所有关联的插件 ID
      const allPluginIds = new Set<string>()
      const envPluginMap = new Map<string, string[]>()

      for (const env of envsToExport) {
        const targets = pluginCatalogService.getTargetsForEnvironment(env.id)
        const pluginIds = targets.map(t => t.pluginId)
        envPluginMap.set(env.id, pluginIds)
        pluginIds.forEach(id => allPluginIds.add(id))
      }

      // 复制 Profile 目录
      const exportEnvs: ExportEnvironment[] = []
      for (const env of envsToExport) {
        const profileDir = `profiles/${env.id}`
        const destDir = join(tempDir, profileDir)

        if (existsSync(env.userDataDir)) {
          await this.copyDirectoryFiltered(env.userDataDir, destDir)
        } else {
          mkdirSync(destDir, { recursive: true })
        }

        // 导出并加密 Cookie
        let cookieFile = ''
        if (cookiePassword) {
          console.log('[ExportImportService] Reading cookies from:', env.userDataDir)
          console.log('[ExportImportService] cookiePassword provided, length=' + cookiePassword.length)
          const cookies = cookieFileService.readCookiesFromFile(env.userDataDir)
          console.log('[ExportImportService] Cookies read from file:', cookies.length)
          
          if (cookies.length > 0) {
            console.log('[ExportImportService] First cookie sample:', JSON.stringify({ name: cookies[0].name, domain: cookies[0].domain, valueLen: (cookies[0].value || '').length }))
            console.log('[ExportImportService] Encrypting ' + cookies.length + ' cookies...')
            const encryptedData = this.encryptCookieData(cookies, cookiePassword)
            console.log('[ExportImportService] Encrypted data size:', encryptedData.length)
            
            const cookiePath = join(destDir, 'Default', 'Cookies.encrypted')
            mkdirSync(join(cookiePath, '..'), { recursive: true })
            writeFileSync(cookiePath, encryptedData)
            cookieFile = `${profileDir}/Default/Cookies.encrypted`
            console.log('[ExportImportService] Cookie file written to:', cookiePath)
          } else {
            console.log('[ExportImportService] NO COOKIES TO ENCRYPT - cookieFile will be empty')
          }
        } else {
          console.log('[ExportImportService] No cookiePassword provided, skipping cookie export')
        }

        exportEnvs.push({
          id: env.id,
          name: env.name,
          fingerprint: env.fingerprint,
          proxy: env.proxy,
          tags: env.tags || [],
          color: env.color,
          groupId: env.groupId,
          profileDir,
          cookieFile,
          pluginIds: envPluginMap.get(env.id) || [],
        })
      }
      
      console.log('[ExportImportService] Export environments:', exportEnvs.length)

      // 复制插件制品
      const exportPlugins: ExportPlugin[] = []
      for (const pluginId of allPluginIds) {
        const plugin = pluginCatalogService.getPlugin(pluginId)
        if (!plugin) continue

        const artifactDir = `plugins/${pluginId}`
        const sourcePath = pluginArtifactService.resolveAbsolutePath(plugin.artifactRelativePath)
        const destPath = join(tempDir, artifactDir)

        if (existsSync(sourcePath)) {
          await this.copyDirectoryFiltered(sourcePath, destPath)
        }

        exportPlugins.push({
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          artifactDir,
        })
      }
      
      console.log('[ExportImportService] Export plugins:', exportPlugins.length)

      // 生成 manifest.json
      const manifest: ExportManifest = {
        version: 1,
        exportedAt: new Date().toISOString(),
        encryption: {
          algorithm: COOKIE_ENCRYPTION.algorithm,
          keyDerivation: COOKIE_ENCRYPTION.keyDerivation,
          iterations: COOKIE_ENCRYPTION.iterations,
        },
        environments: exportEnvs,
        plugins: exportPlugins,
      }

      console.log('[ExportImportService] Writing manifest.json...')
      await writeFile(join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

      // 打包为 ZIP
      console.log('[ExportImportService] Creating ZIP archive...')
      await this.createZipArchive(tempDir, outputPath)

      console.log('[ExportImportService] Logging activity...')
      activityLogService.log({
        envId: 'system',
        action: 'export',
        details: `Exported ${envsToExport.length} environments to ${basename(outputPath)}`,
      })

      console.log('[ExportImportService] Export completed successfully')
      return outputPath
    } finally {
      // 清理临时目录
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  /**
   * 从 ZIP 文件导入环境
   */
  async importEnvironments(zipPath: string, cookiePassword?: string): Promise<ImportResult> {
    if (!existsSync(zipPath)) {
      throw new Error('ZIP file not found')
    }

    // 创建临时目录
    const tempDir = await mkdtemp(join(tmpdir(), 'fpb-import-'))

    try {
      // 解压 ZIP
      await extractZip(zipPath, { dir: tempDir })

      // 读取 manifest.json
      const manifestPath = join(tempDir, 'manifest.json')
      if (!existsSync(manifestPath)) {
        throw new Error('Invalid export file: missing manifest.json')
      }

      const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

      if (manifest.version !== 1) {
        throw new Error(`Unsupported export version: ${manifest.version}`)
      }

      // 获取现有环境名称
      const existingNames = new Set(storageService.getEnvironments().map(e => e.name))

      const result: ImportResult = {
        environments: [],
        plugins: [],
      }

      // 导入插件
      const pluginIdMap = new Map<string, string>() // oldId -> newId (same)
      for (const exportPlugin of manifest.plugins) {
        const existingPlugin = pluginCatalogService.getPlugin(exportPlugin.id)

        if (existingPlugin) {
          // 插件已存在，跳过
          result.plugins.push({
            id: exportPlugin.id,
            name: exportPlugin.name,
            skipped: true,
          })
          pluginIdMap.set(exportPlugin.id, exportPlugin.id)
        } else {
          // 从 ZIP 复制插件
          const sourceDir = join(tempDir, exportPlugin.artifactDir)
          const destDir = pluginArtifactService.resolveAbsolutePath(`ext/${exportPlugin.id}`)

          if (existsSync(sourceDir)) {
            await this.copyDirectoryFiltered(sourceDir, destDir)
          }

          // 创建插件记录
          const plugin: PluginRecord = {
            id: exportPlugin.id,
            name: exportPlugin.name,
            storeUrl: '',
            source: 'chrome-web-store',
            version: exportPlugin.version,
            artifactRelativePath: `ext/${exportPlugin.id}`,
            inheritToNewEnvironments: true,
            installedByAppAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            backend: 'launch-arg',
          }

          pluginCatalogService.upsertPlugin(plugin)

          result.plugins.push({
            id: exportPlugin.id,
            name: exportPlugin.name,
            skipped: false,
          })
          pluginIdMap.set(exportPlugin.id, exportPlugin.id)
        }
      }

      // 导入环境
      for (const exportEnv of manifest.environments) {
        // 解析唯一名称
        const uniqueName = this.resolveUniqueName(exportEnv.name, existingNames)
        existingNames.add(uniqueName)

        // 创建新环境
        const settings = storageService.getSettings()
        const baseDir = settings.browserDataRoot || join(app.getPath('userData'), 'browser-data')
        const newId = `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const newUserDataDir = join(baseDir, newId)

        // 复制 Profile 目录
        const sourceProfileDir = join(tempDir, exportEnv.profileDir)
        if (existsSync(sourceProfileDir)) {
          await this.copyDirectoryFiltered(sourceProfileDir, newUserDataDir)
        } else {
          mkdirSync(newUserDataDir, { recursive: true })
        }

        // 解密并导入 Cookie
        if (cookiePassword && exportEnv.cookieFile) {
          const cookiePath = join(tempDir, exportEnv.cookieFile)
          console.log(`[ExportImportService] IMPORT cookie: cookiePath=${cookiePath} exists=${existsSync(cookiePath)}`)
          if (existsSync(cookiePath)) {
            try {
              const encryptedData = readFileSync(cookiePath)
              console.log(`[ExportImportService] IMPORT cookie: read ${encryptedData.length} bytes from ${cookiePath}`)
              const cookies = this.decryptCookieData(encryptedData, cookiePassword)
              console.log(`[ExportImportService] IMPORT cookie: decrypted ${cookies.length} cookies`)

              // 检查 Local State 是否存在（writeCookiesToFile 依赖它）
              const lsPath = join(newUserDataDir, 'Local State')
              console.log(`[ExportImportService] IMPORT cookie: Local State at ${lsPath} exists=${existsSync(lsPath)}`)

              const result = cookieFileService.writeCookiesToFile(newUserDataDir, cookies)
              console.log(`[ExportImportService] IMPORT cookie: writeCookiesToFile result: success=${result.success} failed=${result.failed}`)
            } catch (error) {
              console.error('[ExportImportService] Failed to decrypt/write cookies:', error)
              // Cookie 解密失败不阻止导入
            }
          } else {
            console.log(`[ExportImportService] IMPORT cookie: cookiePath NOT FOUND, skipping`)
          }
        }

        // 创建环境记录
        const newEnv: Environment = {
          id: newId,
          name: uniqueName,
          fingerprint: exportEnv.fingerprint || {},
          proxy: exportEnv.proxy,
          userDataDir: newUserDataDir,
          cdpPort: this.getAvailableCDPPort(),
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          tags: exportEnv.tags || [],
          color: exportEnv.color || this.generateColor(),
          status: 'stopped',
          groupId: exportEnv.groupId,
        }

        storageService.addEnvironment(newEnv)

        // 创建环境-插件关联
        for (const pluginId of exportEnv.pluginIds) {
          if (pluginIdMap.has(pluginId)) {
            const target: EnvironmentPluginTarget = {
              envId: newId,
              pluginId,
              applyBackend: 'launch-arg',
            }
            storageService.upsertPluginTarget(target)
          }
        }

        result.environments.push({
          id: newId,
          name: uniqueName,
        })
      }

      activityLogService.log({
        envId: 'system',
        action: 'import',
        details: `Imported ${result.environments.length} environments, ${result.plugins.filter(p => !p.skipped).length} plugins`,
      })

      return result
    } finally {
      // 清理临时目录
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  /**
   * 加密 Cookie 数据
   */
  private encryptCookieData(cookies: CookieData[], password: string): Buffer {
    console.log('[ExportImportService] encryptCookieData called with', cookies.length, 'cookies')
    
    const salt = randomBytes(COOKIE_ENCRYPTION.saltLength)
    const key = pbkdf2Sync(password, salt, COOKIE_ENCRYPTION.iterations, 32, 'sha512')
    const iv = randomBytes(COOKIE_ENCRYPTION.ivLength)

    const cipher = createCipheriv(COOKIE_ENCRYPTION.algorithm, key, iv) as CipherGCM
    const jsonData = JSON.stringify(cookies)
    console.log('[ExportImportService] Cookie JSON size:', jsonData.length)

    const encrypted = Buffer.concat([
      cipher.update(jsonData, 'utf8'),
      cipher.final(),
    ])

    const authTag = cipher.getAuthTag()

    // 组合：salt + iv + authTag + encrypted
    const result = Buffer.concat([salt, iv, authTag, encrypted])
    console.log('[ExportImportService] Encrypted data size:', result.length)
    
    return result
  }

  /**
   * 解密 Cookie 数据
   */
  private decryptCookieData(encryptedData: Buffer, password: string): CookieData[] {
    // 提取各部分
    const salt = encryptedData.subarray(0, COOKIE_ENCRYPTION.saltLength)
    const iv = encryptedData.subarray(
      COOKIE_ENCRYPTION.saltLength,
      COOKIE_ENCRYPTION.saltLength + COOKIE_ENCRYPTION.ivLength
    )
    const authTag = encryptedData.subarray(
      COOKIE_ENCRYPTION.saltLength + COOKIE_ENCRYPTION.ivLength,
      COOKIE_ENCRYPTION.saltLength + COOKIE_ENCRYPTION.ivLength + COOKIE_ENCRYPTION.authTagLength
    )
    const encrypted = encryptedData.subarray(
      COOKIE_ENCRYPTION.saltLength + COOKIE_ENCRYPTION.ivLength + COOKIE_ENCRYPTION.authTagLength
    )

    const key = pbkdf2Sync(password, salt, COOKIE_ENCRYPTION.iterations, 32, 'sha512')

    const decipher = createDecipheriv(COOKIE_ENCRYPTION.algorithm, key, iv) as DecipherGCM
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return JSON.parse(decrypted.toString('utf8'))
  }

  /**
   * 过滤复制目录（排除缓存、日志、加密文件等）
   */
  private async copyDirectoryFiltered(source: string, dest: string): Promise<void> {
    mkdirSync(dest, { recursive: true })

    const entries = await readdir(source)

    for (const entry of entries) {
      const entryLower = entry.toLowerCase()

      // 检查是否在排除列表中（不区分大小写）
      if (EXCLUDE_PATTERNS_LOWERCASE.includes(entryLower)) {
        continue
      }

      // 检查是否是加密文件
      if (ENCRYPTED_FILES.includes(entry)) {
        continue
      }

      // 检查是否是日志文件（不区分大小写）
      if (LOG_EXTENSIONS_LOWERCASE.some(ext => entryLower.endsWith(ext))) {
        continue
      }

      const sourcePath = join(source, entry)
      const destPath = join(dest, entry)
      const entryStat = await stat(sourcePath)

      if (entryStat.isDirectory()) {
        await this.copyDirectoryFiltered(sourcePath, destPath)
      } else {
        await copyFile(sourcePath, destPath)
      }
    }
  }

  /**
   * 创建 ZIP 压缩包
   */
  private async createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    console.log('[ExportImportService] createZipArchive called with:', { sourceDir, outputPath })
    
    // 使用 archiver 创建 ZIP
    const archiver = require('archiver')
    const output = require('fs').createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log('[ExportImportService] ZIP archive created, size:', archive.pointer())
        resolve()
      })
      archive.on('error', (err: Error) => {
        console.error('[ExportImportService] ZIP archive error:', err)
        reject(err)
      })

      archive.pipe(output)
      archive.directory(sourceDir, false)
      archive.finalize()
    })
  }

  /**
   * 解析唯一名称（处理重名）
   */
  private resolveUniqueName(baseName: string, existingNames: Set<string>): string {
    if (!existingNames.has(baseName)) {
      return baseName
    }

    let counter = 1
    let newName = `${baseName} (${counter})`
    while (existingNames.has(newName)) {
      counter++
      newName = `${baseName} (${counter})`
    }
    return newName
  }

  /**
   * 获取可用的 CDP 端口
   */
  private getAvailableCDPPort(): number {
    const environments = storageService.getEnvironments()
    const usedPorts = new Set(environments.map(e => e.cdpPort).filter(Boolean))

    for (let port = 9222; port <= 9322; port++) {
      if (!usedPorts.has(port)) {
        return port
      }
    }

    return 9222 + environments.length
  }

  /**
   * 生成随机颜色
   */
  private generateColor(): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
    return colors[Math.floor(Math.random() * colors.length)]
  }
}

export const exportImportService = new ExportImportService()
