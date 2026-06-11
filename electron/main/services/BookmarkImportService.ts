import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { storageService } from './StorageService'
import { launchService } from './LaunchService'
import { activityLogService } from '../managers/ActivityLogService'

export type BookmarkSourceType = 'chrome' | 'edge'

export interface BookmarkSourceCandidate {
  id: string
  type: BookmarkSourceType
  label: string
  profileName: string
  filePath: string
  exists: boolean
}

export interface BookmarkNode {
  type: 'folder' | 'url'
  name: string
  url?: string
  children?: BookmarkNode[]
}

export interface BookmarkPreview {
  sourceType: BookmarkSourceType
  sourcePath: string
  folderCount: number
  urlCount: number
  sample: Array<{ name: string; url: string }>
}

export interface BookmarkImportResult {
  importedEnvironments: number
  totalEnvironments: number
  folderCount: number
  urlCount: number
  skippedRunning: string[]
  failed: Array<{ envId: string; reason: string }>
}

interface ChromiumBookmarkEntry {
  id?: string
  type?: string
  name?: string
  url?: string
  children?: ChromiumBookmarkEntry[]
  date_added?: string
  date_modified?: string
}

interface ChromiumBookmarksFile {
  checksum?: string
  roots: {
    bookmark_bar?: ChromiumBookmarkEntry
    other?: ChromiumBookmarkEntry
    synced?: ChromiumBookmarkEntry
    [key: string]: ChromiumBookmarkEntry | undefined
  }
  version?: number
}

const WINDOWS_EPOCH_OFFSET_MS = 11644473600000n
const MAX_IMPORTED_URLS = 5000

class BookmarkImportService {
  detectSources(): BookmarkSourceCandidate[] {
    const localAppData = process.env.LOCALAPPDATA || ''
    const candidates: BookmarkSourceCandidate[] = []

    candidates.push(...this.detectChromiumProfiles('chrome', 'Chrome', join(localAppData, 'Google', 'Chrome', 'User Data')))
    candidates.push(...this.detectChromiumProfiles('edge', 'Edge', join(localAppData, 'Microsoft', 'Edge', 'User Data')))

    return candidates
  }

  preview(sourceType: BookmarkSourceType, sourcePath: string): BookmarkPreview {
    const tree = this.readSource(sourceType, sourcePath)
    const stats = this.collectStats(tree)
    return {
      sourceType,
      sourcePath,
      folderCount: stats.folderCount,
      urlCount: stats.urlCount,
      sample: stats.sample,
    }
  }

  importToEnvironments(params: {
    sourceType: BookmarkSourceType
    sourcePath: string
    envIds: string[]
    onEnvironmentComplete?: (envId: string) => void
  }): BookmarkImportResult {
    if (!Array.isArray(params.envIds) || params.envIds.length === 0) {
      throw new Error('请选择要导入收藏夹的环境')
    }

    const importedTree = this.readSource(params.sourceType, params.sourcePath)
    const stats = this.collectStats(importedTree)
    if (stats.urlCount === 0) {
      throw new Error('未解析到可导入的收藏夹链接')
    }
    if (stats.urlCount > MAX_IMPORTED_URLS) {
      throw new Error(`单次最多导入 ${MAX_IMPORTED_URLS} 个收藏夹链接`)
    }

    const environments = storageService.getEnvironments()
    const targetEnvs = environments.filter(env => params.envIds.includes(env.id))
    const result: BookmarkImportResult = {
      importedEnvironments: 0,
      totalEnvironments: params.envIds.length,
      folderCount: stats.folderCount,
      urlCount: stats.urlCount,
      skippedRunning: [],
      failed: [],
    }

    for (const envId of params.envIds) {
      try {
        const env = targetEnvs.find(item => item.id === envId)
        if (!env) {
          result.failed.push({ envId, reason: '环境不存在' })
          continue
        }

        if (env.status === 'running' || launchService.isRunning(env.id)) {
          result.skippedRunning.push(env.id)
          continue
        }

        try {
          this.mergeIntoEnvironmentBookmarks(env.userDataDir, importedTree)
          result.importedEnvironments++
          activityLogService.log({
            envId: env.id,
            action: 'import',
            details: `导入收藏夹: ${this.sourceLabel(params.sourceType)} | 链接 ${stats.urlCount} | 文件夹 ${stats.folderCount}`,
          })
        } catch (error) {
          result.failed.push({
            envId: env.id,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        params.onEnvironmentComplete?.(envId)
      }
    }

    activityLogService.log({
      envId: 'system',
      action: 'import',
      details: `导入收藏夹到 ${result.importedEnvironments}/${params.envIds.length} 个环境 | 来源: ${this.sourceLabel(params.sourceType)}`,
    })

    return result
  }

  private detectChromiumProfiles(type: BookmarkSourceType, label: string, userDataDir: string): BookmarkSourceCandidate[] {
    const profileNames = ['Default', ...Array.from({ length: 20 }, (_, index) => `Profile ${index + 1}`)]
    return profileNames
      .map(profileName => {
        const filePath = join(userDataDir, profileName, 'Bookmarks')
        return {
          id: `${type}:${profileName}`,
          type,
          label: `${label} - ${profileName}`,
          profileName,
          filePath,
          exists: existsSync(filePath),
        }
      })
      .filter(candidate => candidate.exists)
  }

  private readSource(sourceType: BookmarkSourceType, sourcePath: string): BookmarkNode[] {
    if (sourceType !== 'chrome' && sourceType !== 'edge') {
      throw new Error('当前仅支持 Chrome 和 Edge 收藏夹导入')
    }
    if (!sourcePath || !existsSync(sourcePath)) {
      throw new Error('收藏夹文件不存在')
    }

    const raw = readFileSync(sourcePath, 'utf8')
    const parsed = JSON.parse(raw) as ChromiumBookmarksFile
    return this.normalizeChromiumBookmarks(parsed)
  }

  private normalizeChromiumBookmarks(file: ChromiumBookmarksFile): BookmarkNode[] {
    const bookmarkBarChildren = file.roots?.bookmark_bar?.children || []
    const mobileBookmarks = file.roots?.synced ? this.normalizeChromiumEntry(file.roots.synced) : null

    const normalized: BookmarkNode[] = []

    if (mobileBookmarks) {
      normalized.push(mobileBookmarks)
    }

    normalized.push(...bookmarkBarChildren
      .map(entry => this.normalizeChromiumEntry(entry))
      .filter((entry): entry is BookmarkNode => !!entry))

    return normalized
  }

  private normalizeChromiumEntry(entry: ChromiumBookmarkEntry): BookmarkNode | null {
    const name = this.cleanName(entry.name || '')

    if (entry.type === 'url') {
      const url = this.cleanUrl(entry.url || '')
      if (!url) return null
      return { type: 'url', name: name || url, url }
    }

    if (entry.type === 'folder' || Array.isArray(entry.children)) {
      const children = (entry.children || [])
        .map(child => this.normalizeChromiumEntry(child))
        .filter((child): child is BookmarkNode => !!child)
      if (children.length === 0) return null
      return { type: 'folder', name: name || '未命名文件夹', children }
    }

    return null
  }

  private mergeIntoEnvironmentBookmarks(userDataDir: string, importedTree: BookmarkNode[]): void {
    const bookmarkPath = join(userDataDir, 'Default', 'Bookmarks')
    mkdirSync(dirname(bookmarkPath), { recursive: true })

    const current = this.readOrCreateChromiumBookmarks(bookmarkPath)
    const usedKeys = new Set<string>()
    this.collectExistingUrlKeys(current, usedKeys)

    let nextId = this.findMaxId(current) + 1
    const now = this.chromeTimestamp()
    const importedChildren = this.toChromiumEntries(importedTree, usedKeys, () => String(nextId++), now)
    if (importedChildren.length === 0) {
      throw new Error('没有新的收藏夹可导入')
    }

    const bookmarkBar = this.ensureBookmarkBar(current)
    bookmarkBar.children = bookmarkBar.children || []
    bookmarkBar.children.push(...importedChildren)
    bookmarkBar.date_modified = now
    delete current.checksum
    writeFileSync(bookmarkPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  }

  private readOrCreateChromiumBookmarks(bookmarkPath: string): ChromiumBookmarksFile {
    if (!existsSync(bookmarkPath)) {
      return this.createEmptyChromiumBookmarks()
    }

    try {
      const parsed = JSON.parse(readFileSync(bookmarkPath, 'utf8')) as ChromiumBookmarksFile
      if (!parsed.roots) return this.createEmptyChromiumBookmarks()
      return parsed
    } catch {
      return this.createEmptyChromiumBookmarks()
    }
  }

  private createEmptyChromiumBookmarks(): ChromiumBookmarksFile {
    const now = this.chromeTimestamp()
    return {
      roots: {
        bookmark_bar: { id: '1', type: 'folder', name: 'Bookmarks bar', date_added: now, date_modified: now, children: [] },
        other: { id: '2', type: 'folder', name: 'Other bookmarks', date_added: now, date_modified: now, children: [] },
        synced: { id: '3', type: 'folder', name: 'Mobile bookmarks', date_added: now, date_modified: now, children: [] },
      },
      version: 1,
    }
  }

  private ensureBookmarkBar(file: ChromiumBookmarksFile): ChromiumBookmarkEntry {
    file.roots = file.roots || {}
    if (!file.roots.bookmark_bar) {
      file.roots.bookmark_bar = {
        id: String(this.findMaxId(file) + 1),
        type: 'folder',
        name: 'Bookmarks bar',
        date_added: this.chromeTimestamp(),
        children: [],
      }
    }
    return file.roots.bookmark_bar
  }

  private toChromiumEntries(
    nodes: BookmarkNode[],
    usedKeys: Set<string>,
    nextId: () => string,
    now: string
  ): ChromiumBookmarkEntry[] {
    const entries: ChromiumBookmarkEntry[] = []

    for (const node of nodes) {
      if (node.type === 'url') {
        const url = this.cleanUrl(node.url || '')
        if (!url) continue
        const key = this.urlKey(node.name, url)
        if (usedKeys.has(key)) continue
        usedKeys.add(key)
        entries.push({
          id: nextId(),
          type: 'url',
          name: this.cleanName(node.name) || url,
          url,
          date_added: now,
        })
      } else {
        const children = this.toChromiumEntries(node.children || [], usedKeys, nextId, now)
        if (children.length === 0) continue
        entries.push({
          id: nextId(),
          type: 'folder',
          name: this.cleanName(node.name) || '未命名文件夹',
          date_added: now,
          date_modified: now,
          children,
        })
      }
    }

    return entries
  }

  private collectStats(nodes: BookmarkNode[]): { folderCount: number; urlCount: number; sample: Array<{ name: string; url: string }> } {
    const stats = { folderCount: 0, urlCount: 0, sample: [] as Array<{ name: string; url: string }> }

    const visit = (items: BookmarkNode[]) => {
      for (const item of items) {
        if (item.type === 'url' && item.url) {
          stats.urlCount++
          if (stats.sample.length < 20) stats.sample.push({ name: item.name, url: item.url })
        } else if (item.type === 'folder') {
          stats.folderCount++
          visit(item.children || [])
        }
      }
    }

    visit(nodes)
    return stats
  }

  private collectExistingUrlKeys(file: ChromiumBookmarksFile, usedKeys: Set<string>): void {
    const visit = (entry?: ChromiumBookmarkEntry) => {
      if (!entry) return
      if (entry.type === 'url' && entry.url) usedKeys.add(this.urlKey(entry.name || '', entry.url))
      for (const child of entry.children || []) visit(child)
    }

    for (const root of Object.values(file.roots || {})) visit(root)
  }

  private findMaxId(file: ChromiumBookmarksFile): number {
    let max = 0
    const visit = (entry?: ChromiumBookmarkEntry) => {
      if (!entry) return
      const id = Number(entry.id)
      if (Number.isFinite(id)) max = Math.max(max, id)
      for (const child of entry.children || []) visit(child)
    }
    for (const root of Object.values(file.roots || {})) visit(root)
    return max
  }

  private cleanName(name: string): string {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  }

  private cleanUrl(url: string): string {
    const value = String(url || '').trim()
    if (!/^https?:\/\//i.test(value)) return ''
    return value.slice(0, 2048)
  }

  private urlKey(name: string, url: string): string {
    return `${this.cleanName(name).toLowerCase()}|${url.trim().toLowerCase()}`
  }

  private chromeTimestamp(): string {
    return String((BigInt(Date.now()) + WINDOWS_EPOCH_OFFSET_MS) * 1000n)
  }

  private sourceLabel(sourceType: BookmarkSourceType): string {
    return sourceType === 'edge' ? 'Edge' : 'Chrome'
  }
}

export const bookmarkImportService = new BookmarkImportService()
export default BookmarkImportService
