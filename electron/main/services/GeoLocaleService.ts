import { connect as connectTcp, Socket } from 'net'
import { connect as connectTls, TLSSocket } from 'tls'
import type { ProxyConfig } from './StorageService'

const GEO_HOST = 'ipapi.co'
const GEO_PORT = 443
const GEO_PATH = '/json/'
const GEO_TIMEOUT_MS = 8000

interface IpApiResponse {
  error?: boolean
  reason?: string
  ip?: string
  country?: string
  country_code?: string
  country_name?: string
  timezone?: string
  languages?: string
}

export interface GeoLocaleResult {
  timezone: string
  lang: string
  source: 'geo' | 'fallback'
  ip?: string
  countryCode?: string
  countryName?: string
  error?: string
}

interface GeoLocaleFallback {
  timezone: string
  lang: string
}

const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  CN: 'zh-CN',
  HK: 'zh-HK',
  TW: 'zh-TW',
  JP: 'ja-JP',
  KR: 'ko-KR',
  SG: 'en-SG',
  TH: 'th-TH',
  ID: 'id-ID',
  PH: 'en-PH',
  IN: 'hi-IN',
  AE: 'ar-AE',
  EG: 'ar-EG',
  US: 'en-US',
  GB: 'en-GB',
  CA: 'en-CA',
  AU: 'en-AU',
  NZ: 'en-NZ',
  FR: 'fr-FR',
  DE: 'de-DE',
  ES: 'es-ES',
  IT: 'it-IT',
  NL: 'nl-NL',
  RU: 'ru-RU',
  MX: 'es-MX',
  BR: 'pt-BR',
  AR: 'es-AR',
  ZA: 'en-ZA',
}

class GeoLocaleService {
  async resolveForLaunch(proxy: ProxyConfig | undefined, fallback: GeoLocaleFallback): Promise<GeoLocaleResult> {
    try {
      const data = await this.queryIpApi(proxy)
      if (data.error) {
        throw new Error(data.reason || 'Geo lookup returned an error')
      }

      const timezone = data.timezone || fallback.timezone
      const countryCode = (data.country_code || data.country || '').toUpperCase()
      const lang = this.resolveLanguage(data.languages, countryCode, fallback.lang)

      return {
        timezone,
        lang,
        source: 'geo',
        ip: data.ip,
        countryCode,
        countryName: data.country_name,
      }
    } catch (error: any) {
      console.warn('[GeoLocaleService] Geo lookup failed, using defaults:', error?.message || error)
      return {
        timezone: fallback.timezone,
        lang: fallback.lang,
        source: 'fallback',
        error: error?.message || String(error),
      }
    }
  }

  private async queryIpApi(proxy?: ProxyConfig): Promise<IpApiResponse> {
    const socket = await this.createTlsSocket(proxy)
    const request = [
      `GET ${GEO_PATH} HTTP/1.1`,
      `Host: ${GEO_HOST}`,
      'User-Agent: fingerprint-browser-geo/1.0',
      'Accept: application/json',
      'Connection: close',
      '',
      '',
    ].join('\r\n')

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let settled = false
      const timer = setTimeout(() => {
        socket.destroy()
        finishError(new Error('Geo lookup timed out'))
      }, GEO_TIMEOUT_MS)

      const cleanup = () => {
        clearTimeout(timer)
        socket.removeAllListeners('data')
        socket.removeAllListeners('end')
        socket.removeAllListeners('close')
        socket.removeAllListeners('error')
      }
      const finishSuccess = () => {
        if (settled) return
        settled = true
        cleanup()
        try {
          resolve(this.parseHttpJson(Buffer.concat(chunks)))
        } catch (error) {
          reject(error)
        }
      }
      const finishError = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      socket.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      socket.on('end', finishSuccess)
      socket.on('close', () => {
        if (chunks.length) finishSuccess()
        else finishError(new Error('Geo lookup connection closed'))
      })
      socket.on('error', finishError)

      socket.write(request)
    })
  }

  private async createTlsSocket(proxy?: ProxyConfig): Promise<TLSSocket> {
    if (!proxy?.host || !proxy.port) {
      return this.connectTlsToHost(GEO_HOST, GEO_PORT, GEO_HOST)
    }

    if (proxy.type === 'socks5') {
      const tunnel = await this.connectSocks5Tunnel(proxy)
      return this.wrapTls(tunnel)
    }

    const tunnel = await this.connectHttpTunnel(proxy)
    return this.wrapTls(tunnel)
  }

  private connectTlsToHost(host: string, port: number, servername: string): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
      const socket = connectTls({ host, port, servername, timeout: GEO_TIMEOUT_MS }, () => resolve(socket))
      socket.once('error', reject)
      socket.once('timeout', () => {
        socket.destroy()
        reject(new Error(`TLS connection to ${host}:${port} timed out`))
      })
    })
  }

  private wrapTls(socket: Socket | TLSSocket): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
      const tlsSocket = connectTls({ socket, servername: GEO_HOST, timeout: GEO_TIMEOUT_MS }, () => resolve(tlsSocket))
      tlsSocket.once('error', reject)
      tlsSocket.once('timeout', () => {
        tlsSocket.destroy()
        reject(new Error('TLS tunnel timed out'))
      })
    })
  }

  private connectTcpSocket(host: string, port: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connectTcp({ host, port, timeout: GEO_TIMEOUT_MS }, () => resolve(socket))
      socket.once('error', reject)
      socket.once('timeout', () => {
        socket.destroy()
        reject(new Error(`Connection to ${host}:${port} timed out`))
      })
    })
  }

  private async connectHttpTunnel(proxy: ProxyConfig): Promise<Socket | TLSSocket> {
    const socket = proxy.type === 'https'
      ? await this.connectTlsToHost(proxy.host, proxy.port, proxy.host)
      : await this.connectTcpSocket(proxy.host, proxy.port)

    const headers = [
      `CONNECT ${GEO_HOST}:${GEO_PORT} HTTP/1.1`,
      `Host: ${GEO_HOST}:${GEO_PORT}`,
      'Connection: keep-alive',
    ]
    if (proxy.username || proxy.password) {
      const token = Buffer.from(`${proxy.username || ''}:${proxy.password || ''}`).toString('base64')
      headers.push(`Proxy-Authorization: Basic ${token}`)
    }

    socket.write(`${headers.join('\r\n')}\r\n\r\n`)
    const response = await this.readUntilHeaderEnd(socket)
    const statusLine = response.toString('latin1').split('\r\n')[0] || ''
    if (!/^HTTP\/\d\.\d 2\d\d\b/.test(statusLine)) {
      socket.destroy()
      throw new Error(`Proxy CONNECT failed: ${statusLine || 'empty response'}`)
    }
    return socket
  }

  private async connectSocks5Tunnel(proxy: ProxyConfig): Promise<Socket> {
    const socket = await this.connectTcpSocket(proxy.host, proxy.port)
    const hasAuth = !!(proxy.username || proxy.password)
    socket.write(Buffer.from(hasAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]))

    const greeting = await this.readExact(socket, 2)
    if (greeting[0] !== 0x05 || greeting[1] === 0xff) {
      socket.destroy()
      throw new Error('SOCKS5 proxy does not accept supported auth methods')
    }

    if (greeting[1] === 0x02) {
      const username = Buffer.from(proxy.username || '')
      const password = Buffer.from(proxy.password || '')
      if (username.length > 255 || password.length > 255) {
        socket.destroy()
        throw new Error('SOCKS5 credentials are too long')
      }
      socket.write(Buffer.concat([
        Buffer.from([0x01, username.length]),
        username,
        Buffer.from([password.length]),
        password,
      ]))
      const auth = await this.readExact(socket, 2)
      if (auth[1] !== 0x00) {
        socket.destroy()
        throw new Error('SOCKS5 authentication failed')
      }
    }

    const host = Buffer.from(GEO_HOST)
    socket.write(Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
      host,
      Buffer.from([GEO_PORT >> 8, GEO_PORT & 0xff]),
    ]))

    const head = await this.readExact(socket, 4)
    if (head[1] !== 0x00) {
      socket.destroy()
      throw new Error(`SOCKS5 connect failed with code ${head[1]}`)
    }

    const addressType = head[3]
    if (addressType === 0x01) await this.readExact(socket, 6)
    else if (addressType === 0x03) {
      const length = (await this.readExact(socket, 1))[0]
      await this.readExact(socket, length + 2)
    } else if (addressType === 0x04) await this.readExact(socket, 18)
    else {
      socket.destroy()
      throw new Error('SOCKS5 proxy returned unknown address type')
    }

    return socket
  }

  private readExact(socket: Socket | TLSSocket, length: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0
      const timer = setTimeout(() => {
        cleanup()
        socket.destroy()
        reject(new Error('Socket read timed out'))
      }, GEO_TIMEOUT_MS)

      const cleanup = () => {
        clearTimeout(timer)
        socket.removeListener('data', onData)
        socket.removeListener('error', onError)
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onData = (chunk: Buffer) => {
        const remaining = length - total
        if (chunk.length >= remaining) {
          chunks.push(chunk.subarray(0, remaining))
          const extra = chunk.subarray(remaining)
          cleanup()
          if (extra.length) socket.unshift(extra)
          resolve(Buffer.concat(chunks, length))
          return
        }
        chunks.push(chunk)
        total += chunk.length
      }

      socket.on('data', onData)
      socket.once('error', onError)
    })
  }

  private readUntilHeaderEnd(socket: Socket | TLSSocket): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0)
      const marker = Buffer.from('\r\n\r\n')
      const timer = setTimeout(() => {
        cleanup()
        socket.destroy()
        reject(new Error('Proxy response timed out'))
      }, GEO_TIMEOUT_MS)

      const cleanup = () => {
        clearTimeout(timer)
        socket.removeListener('data', onData)
        socket.removeListener('error', onError)
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        const headerEnd = buffer.indexOf(marker)
        if (headerEnd === -1) return
        const response = buffer.subarray(0, headerEnd + marker.length)
        const extra = buffer.subarray(headerEnd + marker.length)
        cleanup()
        if (extra.length) socket.unshift(extra)
        resolve(response)
      }

      socket.on('data', onData)
      socket.once('error', onError)
    })
  }

  private parseHttpJson(raw: Buffer): IpApiResponse {
    const marker = Buffer.from('\r\n\r\n')
    const headerEnd = raw.indexOf(marker)
    if (headerEnd === -1) throw new Error('Invalid geo response')

    const headerText = raw.subarray(0, headerEnd).toString('latin1')
    const statusLine = headerText.split('\r\n')[0] || ''
    if (!/^HTTP\/\d\.\d 2\d\d\b/.test(statusLine)) {
      throw new Error(`Geo lookup failed: ${statusLine || 'empty response'}`)
    }

    const body = /transfer-encoding:\s*chunked/i.test(headerText)
      ? this.decodeChunkedBody(raw.subarray(headerEnd + marker.length))
      : raw.subarray(headerEnd + marker.length)

    return JSON.parse(body.toString('utf8'))
  }

  private decodeChunkedBody(body: Buffer): Buffer {
    const chunks: Buffer[] = []
    let offset = 0
    while (offset < body.length) {
      const lineEnd = body.indexOf('\r\n', offset, 'latin1')
      if (lineEnd === -1) break
      const sizeText = body.subarray(offset, lineEnd).toString('latin1').split(';')[0].trim()
      const size = parseInt(sizeText, 16)
      if (!Number.isFinite(size) || size < 0) throw new Error('Invalid chunked geo response')
      offset = lineEnd + 2
      if (size === 0) break
      chunks.push(body.subarray(offset, offset + size))
      offset += size + 2
    }
    return Buffer.concat(chunks)
  }

  private resolveLanguage(languages: string | undefined, countryCode: string, fallback: string): string {
    const countryLanguage = COUNTRY_LANGUAGE_MAP[countryCode]
    if (!languages) return countryLanguage || fallback

    const primary = languages.split(',').map(item => item.trim()).filter(Boolean)[0]
    if (!primary) return countryLanguage || fallback

    if (primary.includes('-')) {
      const [lang, region] = primary.split('-')
      return `${lang.toLowerCase()}-${region.toUpperCase()}`
    }

    return countryLanguage || fallback
  }
}

export const geoLocaleService = new GeoLocaleService()
