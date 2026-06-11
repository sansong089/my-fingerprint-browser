import { existsSync } from 'fs'
import { join } from 'path'
import { bookmarkImportService, type BookmarkImportResult, type BookmarkSourceType, type BookmarkPreview } from './BookmarkImportService'
import { cookieFileService, type CookieData } from './CookieFileService'
import { storageService } from './StorageService'
import { launchService } from './LaunchService'
import { activityLogService } from '../managers/ActivityLogService'

export type BrowserDataSourceType = BookmarkSourceType

export interface BrowserDataSourceCandidate {
  id: string
  type: BrowserDataSourceType
  label: string
  profileName: string
  hasBookmarks: boolean
  hasCookies: boolean
}

export interface BrowserDataImportParams {
  sourceType: BrowserDataSourceType
  sourceProfileName?: string
  envIds: string[]
  dataTypes: ('bookmarks' | 'cookies')[]
}

export interface BrowserDataImportResult {
  importedEnvironments: number
  totalEnvironments: number
  folderCount: number
  urlCount: number
  cookieCount: number
  skippedRunning: string[]
  failed: Array<{ envId: string; reason: string }>
}

export type BrowserDataImportProgressPhase = 'preparing' | 'bookmarks' | 'cookies' | 'finalizing' | 'done' | 'failed'

export interface BrowserDataImportProgress {
  phase: BrowserDataImportProgressPhase
  percent: number
  message: string
  completedSteps: number
  totalSteps: number
}

type BrowserDataImportProgressReporter = (progress: BrowserDataImportProgress) => void

interface ResolvedBrowserProfile {
  sourceType: BrowserDataSourceType
  sourceProfileName: string
  profileDir: string
  bookmarksPath: string
  cookiesPath: string
}

class BrowserProfileImportService {
  detectSources(): BrowserDataSourceCandidate[] {
    const sources: BrowserDataSourceCandidate[] = []
    for (const sourceType of ['chrome', 'edge'] as BrowserDataSourceType[]) {
      sources.push(...this.detectBrowserProfiles(sourceType))
    }
    return sources
  }

  preview(sourceType: BrowserDataSourceType, sourceProfileName?: string): BookmarkPreview {
    const profile = this.resolveProfile(sourceType, sourceProfileName)
    return bookmarkImportService.preview(sourceType, profile.bookmarksPath)
  }

  importData(params: BrowserDataImportParams, onProgress?: BrowserDataImportProgressReporter): BrowserDataImportResult {
    if (!Array.isArray(params.envIds) || params.envIds.length === 0) {
      throw new Error('请选择要导入数据的环境')
    }
    if (!Array.isArray(params.dataTypes) || params.dataTypes.length === 0) {
      throw new Error('请选择要导入的数据类型')
    }

    let totalSteps = 1
    let completedSteps = 0
    const reportProgress = (phase: BrowserDataImportProgressPhase, message: string) => {
      onProgress?.({
        phase,
        message,
        completedSteps,
        totalSteps,
        percent: Math.round((completedSteps / Math.max(totalSteps, 1)) * 100),
      })
    }

    reportProgress('preparing', '正在解析来源数据...')
    const profile = this.resolveProfile(params.sourceType, params.sourceProfileName)
    const environments = storageService.getEnvironments()
    const targetEnvs = environments.filter(env => params.envIds.includes(env.id))

    // 分离运行中和已停止的环境
    const skippedRunning: string[] = []
    const activeEnvIds: string[] = []
    for (const envId of params.envIds) {
      const env = targetEnvs.find(e => e.id === envId)
      if (!env) continue
      if (env.status === 'running' || launchService.isRunning(env.id)) {
        skippedRunning.push(envId)
      } else {
        activeEnvIds.push(envId)
      }
    }

    const result: BrowserDataImportResult = {
      importedEnvironments: 0,
      totalEnvironments: params.envIds.length,
      folderCount: 0,
      urlCount: 0,
      cookieCount: 0,
      skippedRunning,
      failed: [],
    }

    if (activeEnvIds.length === 0) {
      totalSteps = 1
      completedSteps = totalSteps
      reportProgress('done', '没有可导入的已停止环境')
      return result
    }

    totalSteps = 2 + activeEnvIds.length * params.dataTypes.length
    completedSteps = 1
    reportProgress('preparing', `已确认 ${activeEnvIds.length} 个可导入环境`)
    const importedEnvIds = new Set<string>()

    // 导入收藏夹
    if (params.dataTypes.includes('bookmarks')) {
      let bookmarkProcessed = 0
      const reportBookmarkEnvironmentComplete = () => {
        bookmarkProcessed++
        completedSteps++
        reportProgress('bookmarks', `正在导入收藏夹（${Math.min(bookmarkProcessed, activeEnvIds.length)}/${activeEnvIds.length}）...`)
      }

      reportProgress('bookmarks', `准备导入收藏夹（0/${activeEnvIds.length}）...`)
      try {
        const bookmarkResult = this.importBookmarks(profile.sourceType, profile.bookmarksPath, activeEnvIds, reportBookmarkEnvironmentComplete)
        for (const envId of this.getSuccessfulEnvIds(activeEnvIds, bookmarkResult.failed)) {
          importedEnvIds.add(envId)
        }
        result.importedEnvironments = importedEnvIds.size
        result.folderCount = bookmarkResult.folderCount
        result.urlCount = bookmarkResult.urlCount
        result.failed.push(...bookmarkResult.failed)
      } catch (error) {
        result.failed.push({
          envId: 'bookmarks',
          reason: error instanceof Error ? error.message : String(error),
        })
      }
      while (bookmarkProcessed < activeEnvIds.length) {
        reportBookmarkEnvironmentComplete()
      }
      reportProgress('bookmarks', '收藏夹导入完成')
    }

    // 导入 Cookie
    if (params.dataTypes.includes('cookies')) {
      let cookieProcessed = 0
      const reportCookieEnvironmentComplete = () => {
        cookieProcessed++
        completedSteps++
        reportProgress('cookies', `正在导入 Cookie（${Math.min(cookieProcessed, activeEnvIds.length)}/${activeEnvIds.length}）...`)
      }

      reportProgress('cookies', `准备导入 Cookie（0/${activeEnvIds.length}）...`)
      try {
        const cookieResult = this.importCookies(profile.profileDir, activeEnvIds, reportCookieEnvironmentComplete)
        result.cookieCount = cookieResult.cookieCount
        result.failed.push(...cookieResult.failed)
        for (const envId of cookieResult.importedEnvIds) {
          importedEnvIds.add(envId)
        }
        result.importedEnvironments = importedEnvIds.size
      } catch (error) {
        result.failed.push({
          envId: 'cookies',
          reason: error instanceof Error ? error.message : String(error),
        })
      }
      while (cookieProcessed < activeEnvIds.length) {
        reportCookieEnvironmentComplete()
      }
      reportProgress('cookies', 'Cookie 导入完成')
    }

    // 记录活动日志
    reportProgress('finalizing', '正在收尾并刷新结果...')
    const parts: string[] = []
    if (params.dataTypes.includes('bookmarks')) parts.push(`收藏夹 ${result.urlCount} 链接`)
    if (params.dataTypes.includes('cookies')) parts.push(`Cookie ${result.cookieCount} 个`)
    activityLogService.log({
      envId: 'system',
      action: 'import',
      details: `导入浏览器数据到 ${result.importedEnvironments}/${params.envIds.length} 个环境 | ${parts.join(' | ')} | 来源: ${profile.sourceType}/${profile.sourceProfileName}`,
    })

    completedSteps = totalSteps
    reportProgress('done', '导入完成')
    return result
  }

  private detectBrowserProfiles(sourceType: BrowserDataSourceType): BrowserDataSourceCandidate[] {
    const profileNames = ['Default', ...Array.from({ length: 20 }, (_, index) => `Profile ${index + 1}`)]
    const label = sourceType === 'edge' ? 'Edge' : 'Chrome'

    return profileNames
      .map(profileName => {
        const profile = this.buildProfile(sourceType, profileName)
        const hasBookmarks = existsSync(profile.bookmarksPath)
        const hasCookies = existsSync(profile.cookiesPath)
        return {
          id: `${sourceType}:${profileName}`,
          type: sourceType,
          label: `${label} - ${profileName}`,
          profileName,
          hasBookmarks,
          hasCookies,
        }
      })
      .filter(candidate => candidate.hasBookmarks || candidate.hasCookies)
  }

  private resolveProfile(sourceType: BrowserDataSourceType, sourceProfileName?: string): ResolvedBrowserProfile {
    if (sourceType !== 'chrome' && sourceType !== 'edge') {
      throw new Error('当前仅支持 Chrome 和 Edge 浏览器数据导入')
    }

    const profileName = sourceProfileName || this.detectBrowserProfiles(sourceType)[0]?.profileName
    if (!profileName) {
      throw new Error(`未检测到可导入的 ${sourceType === 'edge' ? 'Edge' : 'Chrome'} Profile`)
    }

    const profile = this.buildProfile(sourceType, profileName)
    if (!existsSync(profile.bookmarksPath) && !existsSync(profile.cookiesPath)) {
      throw new Error('所选 Profile 没有可导入的收藏夹或 Cookie')
    }
    return profile
  }

  private buildProfile(sourceType: BrowserDataSourceType, profileName: string): ResolvedBrowserProfile {
    const userDataDir = this.getUserDataDir(sourceType)
    const profileDir = join(userDataDir, profileName)
    return {
      sourceType,
      sourceProfileName: profileName,
      profileDir,
      bookmarksPath: join(profileDir, 'Bookmarks'),
      cookiesPath: join(profileDir, 'Network', 'Cookies'),
    }
  }

  private getUserDataDir(sourceType: BrowserDataSourceType): string {
    const localAppData = process.env.LOCALAPPDATA || ''
    if (sourceType === 'edge') return join(localAppData, 'Microsoft', 'Edge', 'User Data')
    return join(localAppData, 'Google', 'Chrome', 'User Data')
  }

  private importBookmarks(
    sourceType: BrowserDataSourceType,
    sourcePath: string,
    envIds: string[],
    onEnvironmentComplete?: (envId: string) => void
  ): BookmarkImportResult {
    return bookmarkImportService.importToEnvironments({
      sourceType,
      sourcePath,
      envIds,
      onEnvironmentComplete,
    })
  }

  private importCookies(
    profileDir: string,
    envIds: string[],
    onEnvironmentComplete?: (envId: string) => void
  ): { importedEnvIds: string[]; cookieCount: number; failed: Array<{ envId: string; reason: string }> } {
    const result = { importedEnvIds: [] as string[], cookieCount: 0, failed: [] as Array<{ envId: string; reason: string }> }

    // 读取源浏览器 Cookie
    let sourceCookies: CookieData[] = []
    try {
      sourceCookies = cookieFileService.readCookiesFromFile(profileDir, { throwOnError: true })
    } catch (error) {
      console.warn('[BrowserProfileImportService] Failed to read source cookies:', error)
      result.failed.push({
        envId: 'cookies',
        reason: error instanceof Error ? error.message : String(error),
      })
      return result
    }

    if (sourceCookies.length === 0) {
      for (const envId of envIds) {
        onEnvironmentComplete?.(envId)
      }
      return result
    }

    // 写入每个目标环境
    const environments = storageService.getEnvironments()
    for (const envId of envIds) {
      try {
        const env = environments.find(e => e.id === envId)
        if (!env) {
          result.failed.push({ envId, reason: '环境不存在' })
          continue
        }

        if (env.status === 'running' || launchService.isRunning(env.id)) {
          continue // 由 importData 统一处理 skippedRunning
        }

        try {
          const writeResult = cookieFileService.writeCookiesToFile(env.userDataDir, sourceCookies)
          result.cookieCount += writeResult.success
          if (writeResult.success > 0) {
            result.importedEnvIds.push(envId)
          }
          if (writeResult.failed > 0) {
            result.failed.push({ envId, reason: `Cookie 写入失败 ${writeResult.failed} 个` })
          }
        } catch (error) {
          result.failed.push({
            envId,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        onEnvironmentComplete?.(envId)
      }
    }

    return result
  }

  private getSuccessfulEnvIds(envIds: string[], failed: Array<{ envId: string; reason: string }>): string[] {
    const failedEnvIds = new Set(failed.map(item => item.envId))
    return envIds.filter(envId => !failedEnvIds.has(envId))
  }
}

export const browserProfileImportService = new BrowserProfileImportService()
export default BrowserProfileImportService
