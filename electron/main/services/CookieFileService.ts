/**
 * CookieFileService — 直接读写 Chrome Cookies SQLite 文件
 *
 * 完整支持 Chrome cookie 加密/解密：
 * - 解密：Local State → DPAPI → AES key → AES-256-GCM → 明文
 * - 加密：明文 → AES-256-GCM → v10 格式 blob → 写入 SQLite
 */
import Database from 'better-sqlite3'
import { basename, dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { randomBytes, createDecipheriv, createCipheriv, createHash, type CipherGCM, type DecipherGCM } from 'crypto'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

// Chrome 时间戳基准差（微秒）
const CHROME_EPOCH_DIFF = 11644473600000000

// Chrome cookie 加密版本前缀
const CHROME_ENCRYPTION_VERSION = 'v10'

// DPAPI blob 前缀（"DPAPI" 的 ASCII 编码）
const DPAPI_PREFIX_LENGTH = 5

export interface CookieData {
  name: string
  value: string
  domain: string
  path?: string
  expires?: number
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

interface ChromeCookieRow {
  host_key: string
  name: string
  value: string
  path: string
  expires_utc: number
  is_secure: number
  is_httponly: number
  samesite: number
  encrypted_value: Buffer
}

class CookieFileService {
  // 缓存 AES key: userDataDir → Buffer
  private aesKeyCache = new Map<string, Buffer>()

  /**
   * 从 Cookies SQLite 文件读取所有 cookie（自动解密）
   */
  readCookiesFromFile(inputPath: string, options: { throwOnError?: boolean } = {}): CookieData[] {
    const { userDataDir, cookiesPath } = this.resolveChromiumPaths(inputPath)
    if (!existsSync(cookiesPath)) {
      return []
    }

    let db: Database.Database | null = null
    try {
      db = new Database(cookiesPath, { readonly: true, fileMustExist: true })

      const rows = db.prepare('SELECT * FROM cookies').all() as ChromeCookieRow[]

      const cookies: CookieData[] = []
      for (const row of rows) {
        try {
          const cookie = this.chromeRowToCookieData(row, userDataDir)
          if (cookie) {
            cookies.push(JSON.parse(JSON.stringify(cookie)))
          }
        } catch (error) {
          console.error('[CookieFileService] Error processing cookie row:', error)
        }
      }

      return cookies
    } catch (error) {
      console.error('[CookieFileService] Error reading cookies:', error)
      if (options.throwOnError) {
        throw new Error('Cookie 文件存在但无法读取，请先关闭源浏览器后重试。')
      }
      return []
    } finally {
      db?.close()
    }
  }

  /**
   * 写入 cookie 到 Cookies SQLite 文件（自动加密）
   */
  writeCookiesToFile(userDataDir: string, cookies: CookieData[]): { success: number; failed: number } {
    // Chrome 133+ 固定使用 Default/Network/Cookies，不依赖 fallback
    const cookiesPath = join(userDataDir, 'Default', 'Network', 'Cookies')
    // 确保父目录存在
    const parentDir = join(cookiesPath, '..')
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }

    if (!existsSync(cookiesPath)) {
      this.createEmptyCookiesDb(cookiesPath)
    }

    if (cookies.some(cookie => !!cookie.value) && !this.getAesKey(userDataDir, { createIfMissing: true })) {
      console.error('[CookieFileService] Cannot write cookies without AES key:', userDataDir)
      return { success: 0, failed: cookies.length }
    }

    let db: Database.Database | null = null
    let success = 0
    let failed = 0

    try {
      db = new Database(cookiesPath)

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO cookies (
          creation_utc, host_key, top_frame_site_key, name, value, path, expires_utc,
          is_secure, is_httponly, samesite,
          encrypted_value, has_expires, is_persistent,
          priority, source_scheme, source_port,
          last_access_utc, last_update_utc, source_type, has_cross_site_ancestor
        ) VALUES (
          @creation_utc, @host_key, @top_frame_site_key, @name, @value, @path, @expires_utc,
          @is_secure, @is_httponly, @samesite,
          @encrypted_value, @has_expires, @is_persistent,
          @priority, @source_scheme, @source_port,
          @last_access_utc, @last_update_utc, @source_type, @has_cross_site_ancestor
        )
      `)

      const insertMany = db.transaction((items: CookieData[]) => {
        for (const cookie of items) {
          try {
            const row = this.cookieDataToChromeRow(cookie, userDataDir)
            insertStmt.run(row)
            success++
          } catch (error) {
            console.error(`[CookieFileService] Failed to write cookie ${cookie.name}:`, error)
            failed++
          }
        }
      })

      insertMany(cookies)
    } catch (error) {
      console.error('[CookieFileService] Error writing cookies:', error)
      failed = cookies.length
    } finally {
      db?.close()
      this.aesKeyCache.delete(userDataDir)
    }

    return { success, failed }
  }

  // ==================== 路径 ====================

  private resolveChromiumPaths(inputPath: string): { userDataDir: string; profileDir: string; cookiesPath: string } {
    const normalizedInput = inputPath.trim()
    const inputName = basename(normalizedInput)
    const looksLikeProfileDir = inputName === 'Default' || /^Profile \d+$/i.test(inputName)
    const directLocalState = join(normalizedInput, 'Local State')
    const parentUserDataDir = dirname(normalizedInput)
    const parentLocalState = join(parentUserDataDir, 'Local State')

    if (looksLikeProfileDir && existsSync(parentLocalState)) {
      return {
        userDataDir: parentUserDataDir,
        profileDir: normalizedInput,
        cookiesPath: join(normalizedInput, 'Network', 'Cookies'),
      }
    }

    if (existsSync(directLocalState)) {
      return {
        userDataDir: normalizedInput,
        profileDir: join(normalizedInput, 'Default'),
        cookiesPath: join(normalizedInput, 'Default', 'Network', 'Cookies'),
      }
    }

    if (looksLikeProfileDir) {
      return {
        userDataDir: parentUserDataDir,
        profileDir: normalizedInput,
        cookiesPath: join(normalizedInput, 'Network', 'Cookies'),
      }
    }

    return {
      userDataDir: normalizedInput,
      profileDir: join(normalizedInput, 'Default'),
      cookiesPath: join(normalizedInput, 'Default', 'Network', 'Cookies'),
    }
  }

  // ==================== DPAPI + AES 密钥管理 ====================

  /**
   * 从 Local State 获取 Chrome AES-256 加密密钥
   */
  private getAesKey(userDataDir: string, options: { createIfMissing?: boolean } = {}): Buffer | null {
    // 检查缓存
    if (this.aesKeyCache.has(userDataDir)) {
      return this.aesKeyCache.get(userDataDir)!
    }

    try {
      const lsPath = join(userDataDir, 'Local State')
      if (!existsSync(lsPath)) {
        if (options.createIfMissing) {
          return this.createLocalStateAesKey(userDataDir)
        }
        return null
      }

      const lsData = JSON.parse(readFileSync(lsPath, 'utf8'))
      const encryptedKeyB64: string | undefined = lsData.os_crypt?.encrypted_key
      if (!encryptedKeyB64) {
        if (options.createIfMissing) {
          return this.createLocalStateAesKey(userDataDir, lsData)
        }
        return null
      }

      const encryptedKeyBuf = Buffer.from(encryptedKeyB64, 'base64')

      // Chrome 格式: "DPAPI" (5 bytes) + DPAPI blob
      const dpapiBlob = encryptedKeyBuf.subarray(DPAPI_PREFIX_LENGTH)

      // 调用 PowerShell DPAPI 解密
      const aesKey = this.dpapiDecrypt(dpapiBlob)
      if (aesKey && aesKey.length === 32) {
        this.aesKeyCache.set(userDataDir, aesKey)
        return aesKey
      }
      return null
    } catch (error) {
      console.error('[CookieFileService] Failed to get AES key:', error)
      return null
    }
  }

  private createLocalStateAesKey(userDataDir: string, localState: any = {}): Buffer | null {
    try {
      mkdirSync(userDataDir, { recursive: true })
      const aesKey = randomBytes(32)
      const encryptedKey = this.dpapiEncrypt(aesKey)
      if (!encryptedKey) return null

      const nextLocalState = {
        ...localState,
        os_crypt: {
          ...(localState?.os_crypt || {}),
          encrypted_key: Buffer.concat([Buffer.from('DPAPI', 'utf8'), encryptedKey]).toString('base64'),
        },
      }

      writeFileSync(join(userDataDir, 'Local State'), `${JSON.stringify(nextLocalState, null, 2)}\n`, 'utf8')
      this.aesKeyCache.set(userDataDir, aesKey)
      return aesKey
    } catch (error) {
      console.error('[CookieFileService] Failed to create Local State AES key:', error)
      return null
    }
  }

  /**
   * 通过 PowerShell 调用 Windows DPAPI 加密
   */
  private dpapiEncrypt(plain: Buffer): Buffer | null {
    const tmpFile = join(tmpdir(), `fpb-dpapi-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.bin`)
    const resultFile = tmpFile + '.protected'

    try {
      require('fs').writeFileSync(tmpFile, plain)
      const psCmd = `powershell -NoProfile -Command "$b=[System.IO.File]::ReadAllBytes('${tmpFile}'); Add-Type -AssemblyName System.Security; $p=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'); [System.IO.File]::WriteAllBytes('${resultFile}', $p)"`
      execSync(psCmd, { timeout: 15000, encoding: 'utf8' })
      if (existsSync(resultFile)) {
        return require('fs').readFileSync(resultFile)
      }
      return null
    } catch (error) {
      console.error('[CookieFileService] DPAPI encrypt failed:', error)
      return null
    } finally {
      try { require('fs').unlinkSync(tmpFile) } catch (_) {}
      try { require('fs').unlinkSync(resultFile) } catch (_) {}
    }
  }

  /**
   * 通过 PowerShell 调用 Windows DPAPI 解密
   */
  private dpapiDecrypt(blob: Buffer): Buffer | null {
    const tmpFile = join(tmpdir(), `fpb-dpapi-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.bin`)
    const resultFile = tmpFile + '.plain'

    try {
      // 写入 DPAPI blob 到临时文件
      require('fs').writeFileSync(tmpFile, blob)

      const psCmd = `powershell -NoProfile -Command "$b=[System.IO.File]::ReadAllBytes('${tmpFile}'); Add-Type -AssemblyName System.Security; $p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); [System.IO.File]::WriteAllBytes('${resultFile}', $p)"`

      // PowerShell 调用 DPAPI Unprotect
      execSync(psCmd, { timeout: 15000, encoding: 'utf8' })

      if (existsSync(resultFile)) {
        return require('fs').readFileSync(resultFile)
      }
      return null
    } catch (error) {
      console.error('[CookieFileService] DPAPI decrypt failed:', error)
      return null
    } finally {
      // 清理临时文件
      try { require('fs').unlinkSync(tmpFile) } catch (_) {}
      try { require('fs').unlinkSync(resultFile) } catch (_) {}
    }
  }

  // ==================== Chrome v10 解密/加密 ====================

  /**
   * Chrome v10 格式解密（AES-256-GCM）
   * 格式: "v10" (3 bytes) + nonce (12 bytes) + ciphertext + auth_tag (16 bytes)
   * 解密后的明文: SHA256(host_key)(32 bytes) + actual_cookie_value
   */
  private chromeDecrypt(encryptedValue: Buffer, aesKey: Buffer): Buffer {
    if (encryptedValue.length < 15 + 16) return Buffer.from([]) // v10(3) + nonce(12) + min_ciphertext + tag(16)

    // 验证版本前缀
    const version = encryptedValue.toString('utf8', 0, 3)
    if (version !== 'v10' && version !== 'v11') {
      // 非 Chrome 加密格式，尝试直接获取原始数据
      return encryptedValue
    }

    const nonce = encryptedValue.subarray(3, 15)
    const ciphertext = encryptedValue.subarray(15, encryptedValue.length - 16)
    const tag = encryptedValue.subarray(encryptedValue.length - 16)

    try {
      const decipher = createDecipheriv('aes-256-gcm', aesKey, nonce) as DecipherGCM
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()])
    } catch (error) {
      console.error('[CookieFileService] AES decrypt failed:', error)
      return Buffer.from([])
    }
  }

  /**
   * Chrome v10 格式加密（AES-256-GCM）
   * 格式: "v10" (3 bytes) + nonce (12 bytes) + ciphertext + auth_tag (16 bytes)
   * 加密前的明文: SHA256(host_key)(32 bytes) + actual_cookie_value
   */
  private chromeEncrypt(plaintext: Buffer, aesKey: Buffer): Buffer {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', aesKey, nonce) as CipherGCM
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()

    return Buffer.concat([
      Buffer.from(CHROME_ENCRYPTION_VERSION, 'utf8'),
      nonce,
      encrypted,
      tag,
    ])
  }

  /**
   * 解密 cookie value（去除 SHA256 domain 前缀）
   */
  private decryptCookieValue(encryptedValue: Buffer, aesKey: Buffer, hostKey: string): string {
    const plaintext = this.chromeDecrypt(encryptedValue, aesKey)
    if (plaintext.length === 0) return ''

    // Chrome 加密格式: SHA256(host_key)(32 bytes) + actual_value
    const expectedHash = createHash('sha256').update(hostKey).digest()
    const storedHash = plaintext.subarray(0, 32)

    // 验证 SHA256 前缀
    if (storedHash.equals(expectedHash) && plaintext.length > 32) {
      return plaintext.subarray(32).toString('utf8')
    }

    // 兼容：没有 SHA256 前缀的旧格式
    return plaintext.toString('utf8')
  }



  // ==================== 行转换 ====================

  /**
   * Chrome cookie 行 → CookieData（自动解密）
   */
  private chromeRowToCookieData(row: ChromeCookieRow, userDataDir: string): CookieData | null {
    try {
      let value = row.value || ''
      const hasEncrypted = row.encrypted_value && row.encrypted_value.length > 0
      if (!value && hasEncrypted) {
        // 获取 AES key 并解密（自动处理 SHA256 domain 前缀）
        const aesKey = this.getAesKey(userDataDir)
        if (aesKey) {
          value = this.decryptCookieValue(row.encrypted_value, aesKey, row.host_key)
        }
      }

      const cookie: CookieData = {
        name: String(row.name || ''),
        value: String(value),
        domain: String(row.host_key || ''),
        path: String(row.path || '/'),
        expires: row.expires_utc ? this.chromeTimeToJsTime(row.expires_utc) : undefined,
        secure: row.is_secure === 1,
        httpOnly: row.is_httponly === 1,
        sameSite: this.samesiteFromChrome(row.samesite),
      }

      return cookie
    } catch (error) {
      console.error('[CookieFileService] Error converting cookie row:', error)
      return null
    }
  }

  /**
   * CookieData → Chrome cookie 行（自动加密）
   * Chrome v10 格式: AES_GCM_encrypt(SHA256(host_key)(32B) + value)
   */
  private cookieDataToChromeRow(cookie: CookieData, userDataDir: string): any {
    const now = Date.now()
    const domain = cookie.domain || ''

    // 加密 cookie value 为 Chrome v10 格式
    let encryptedValue: Buffer = Buffer.from([])
    if (cookie.value) {
      const aesKey = this.getAesKey(userDataDir, { createIfMissing: true })
      if (aesKey) {
        // 构建明文: SHA256(host_key)(32 bytes) + value
        const domainHash = createHash('sha256').update(domain).digest()
        const plaintext = Buffer.concat([domainHash, Buffer.from(cookie.value, 'utf8')])
        encryptedValue = this.chromeEncrypt(plaintext, aesKey)
      } else {
        throw new Error('无法获取 Cookie 加密密钥')
      }
    }

    return {
      creation_utc: this.jsTimeToChromeTime(now),
      host_key: cookie.domain,
      top_frame_site_key: '',
      name: cookie.name,
      value: '', // Chrome 将明文值留空，使用 encrypted_value
      path: cookie.path || '/',
      expires_utc: cookie.expires ? this.jsTimeToChromeTime(cookie.expires) : now + 86400000000, // 默认 1000 天后过期
      is_secure: cookie.secure ? 1 : 0,
      is_httponly: cookie.httpOnly ? 1 : 0,
      samesite: this.samesiteToChrome(cookie.sameSite),
      encrypted_value: encryptedValue,
      has_expires: cookie.expires ? 1 : 1,
      is_persistent: 1,
      priority: 1,
      source_scheme: cookie.secure ? 1 : 0,
      source_port: -1,
      last_access_utc: this.jsTimeToChromeTime(now),
      last_update_utc: this.jsTimeToChromeTime(now),
      source_type: 1, // SOURCE_TYPE_HTTP (typical for imported cookies)
      has_cross_site_ancestor: 0,
    }
  }

  // ==================== 时间戳 ====================

  private chromeTimeToJsTime(chromeTime: number): number {
    return Math.floor(chromeTime / 1000) - CHROME_EPOCH_DIFF / 1000
  }

  private jsTimeToChromeTime(jsTime: number): number {
    return (jsTime + CHROME_EPOCH_DIFF / 1000) * 1000
  }

  // ==================== SameSite ====================

  private samesiteFromChrome(value: number): 'Strict' | 'Lax' | 'None' | undefined {
    switch (value) {
      case 0: return 'None'
      case 1: return 'Lax'
      case 2: return 'Strict'
      default: return undefined
    }
  }

  private samesiteToChrome(value?: string): number {
    switch (value) {
      case 'None': return 0
      case 'Lax': return 1
      case 'Strict': return 2
      default: return -1
    }
  }

  // ==================== 数据库 ====================

  private createEmptyCookiesDb(dbPath: string): void {
    const dir = join(dbPath, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE IF NOT EXISTS cookies (
        creation_utc INTEGER NOT NULL,
        host_key TEXT NOT NULL,
        top_frame_site_key TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        encrypted_value BLOB NOT NULL DEFAULT '',
        path TEXT NOT NULL,
        expires_utc INTEGER NOT NULL,
        is_secure INTEGER NOT NULL,
        is_httponly INTEGER NOT NULL,
        last_access_utc INTEGER NOT NULL,
        has_expires INTEGER NOT NULL DEFAULT 0,
        is_persistent INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 1,
        samesite INTEGER NOT NULL DEFAULT -1,
        source_scheme INTEGER NOT NULL DEFAULT 0,
        source_port INTEGER NOT NULL DEFAULT -1,
        last_update_utc INTEGER NOT NULL DEFAULT 0,
        source_type INTEGER NOT NULL DEFAULT 1,
        has_cross_site_ancestor INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS cookies_domain ON cookies(host_key);
    `)
    db.close()
  }
}

export const cookieFileService = new CookieFileService()
