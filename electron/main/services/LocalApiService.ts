import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { activityLogService } from '../managers/ActivityLogService'
import { environmentManager } from '../managers/EnvironmentManager'
import { validate as validateIPC } from '../managers/IPCValidator'
import { windowManager } from '../managers/WindowManager'
import { launchService } from './LaunchService'
import { storageService } from './StorageService'

const LOCAL_API_HOST = '127.0.0.1'
const LOCAL_API_PORT = 45912

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS'

interface HttpError extends Error {
  statusCode?: number
  details?: unknown
}

type RouteHandler = (ctx: {
  body: any
  params: Record<string, string>
  url: URL
}) => Promise<unknown> | unknown

interface Route {
  method: HttpMethod
  pattern: RegExp
  paramNames: string[]
  handler: RouteHandler
}

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError
  error.statusCode = statusCode
  error.details = details
  return error
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(createHttpError(400, 'Request body must be valid JSON'))
      }
    })

    req.on('error', (error) => reject(error))
  })
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end(JSON.stringify(payload))
}

function toRoutePattern(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  const regex = path.replace(/:[^/]+/g, (match) => {
    paramNames.push(match.slice(1))
    return '([^/]+)'
  })

  return {
    pattern: new RegExp(`^${regex}$`),
    paramNames,
  }
}

function decodeParams(match: RegExpExecArray, paramNames: string[]): Record<string, string> {
  return paramNames.reduce<Record<string, string>>((acc, name, index) => {
    acc[name] = decodeURIComponent(match[index + 1] || '')
    return acc
  }, {})
}

function assertValidation(channel: string, payload: unknown): any {
  const validation = validateIPC(channel, payload)
  if (!validation.success) {
    throw createHttpError(400, validation.error)
  }
  return validation.data
}

function requireArrayOfStrings(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item)) {
    throw createHttpError(400, `${fieldName} must be a non-empty string array`)
  }
  return value
}

function requireLaunchMode(value: unknown): 'cdp' | 'standard' {
  if (value === undefined || value === 'cdp') return 'cdp'
  if (value === 'standard') return 'standard'
  throw createHttpError(400, 'launchMode must be "cdp" or "standard"')
}

class LocalApiService {
  private server = createServer((req, res) => {
    void this.handleRequest(req, res)
  })

  private started = false
  private routes: Route[]

  constructor() {
    this.routes = this.buildRoutes()
  }

  start(): void {
    if (this.started) return

    this.server.listen(LOCAL_API_PORT, LOCAL_API_HOST, () => {
      this.started = true
      const address = this.server.address() as AddressInfo | null
      console.log(`[LocalApiService] Listening on http://${LOCAL_API_HOST}:${address?.port || LOCAL_API_PORT}`)
    })

    this.server.on('error', (error) => {
      console.error('[LocalApiService] Server error:', error)
    })
  }

  stop(): void {
    if (!this.started) return
    this.server.close(() => {
      this.started = false
    })
  }

  private buildRoutes(): Route[] {
    return [
      this.route('GET', '/envs', () => environmentManager.getEnvironmentViews()),
      this.route('GET', '/envs/running', () => environmentManager.getRunningEnvironmentViews()),
      this.route('POST', '/envs', ({ body }) => {
        const payload = assertValidation('create-environment', body)
        return environmentManager.createEnvironment(payload)
      }),
      this.route('PUT', '/envs/:id', ({ body, params }) => {
        const payload = assertValidation('update-environment', { id: params.id, ...body })
        const updated = environmentManager.updateEnvironment(params.id, payload)
        if (!updated) {
          throw createHttpError(404, `Environment ${params.id} not found`)
        }
        return environmentManager.getEnvironmentView(params.id)
      }),
      this.route('DELETE', '/envs/:id', ({ params }) => {
        const env = environmentManager.getEnvironment(params.id)
        if (!env) {
          throw createHttpError(404, `Environment ${params.id} not found`)
        }
        environmentManager.deleteEnvironment(params.id)
        return { success: true }
      }),
      this.route('POST', '/envs/:id/start', async ({ body, params }) => {
        const env = environmentManager.getEnvironment(params.id)
        if (!env) {
          throw createHttpError(404, `Environment ${params.id} not found`)
        }

        const runtime = environmentManager.getEnvironmentRuntime(params.id)
        if (runtime?.isRunning) {
          throw createHttpError(409, `Environment ${params.id} is already running`)
        }

        const launchMode = requireLaunchMode(body?.launchMode)
        const success = await environmentManager.launchBrowser(params.id, launchMode)
        if (!success) {
          throw createHttpError(500, `Failed to start environment ${params.id}`)
        }

        return environmentManager.getEnvironmentView(params.id)
      }),
      this.route('POST', '/envs/:id/stop', ({ params }) => {
        const env = environmentManager.getEnvironment(params.id)
        if (!env) {
          throw createHttpError(404, `Environment ${params.id} not found`)
        }

        const runtime = environmentManager.getEnvironmentRuntime(params.id)
        if (!runtime?.isRunning) {
          throw createHttpError(409, `Environment ${params.id} is not running`)
        }

        const success = environmentManager.closeBrowser(params.id)
        if (!success) {
          throw createHttpError(500, `Failed to stop environment ${params.id}`)
        }

        return environmentManager.getEnvironmentView(params.id)
      }),
      this.route('POST', '/envs/window/maximize', ({ body }) => {
        const envIds = requireArrayOfStrings(body?.envIds, 'envIds')
        this.ensureRunningEnvs(envIds)
        this.invokeWindowAction('maximize', envIds)
        return { success: true, envIds }
      }),
      this.route('POST', '/envs/window/minimize', ({ body }) => {
        const envIds = requireArrayOfStrings(body?.envIds, 'envIds')
        this.ensureRunningEnvs(envIds)
        this.invokeWindowAction('minimize', envIds)
        return { success: true, envIds }
      }),
      this.route('POST', '/envs/window/arrange', ({ body }) => {
        const envIds = requireArrayOfStrings(body?.envIds, 'envIds')
        this.ensureRunningEnvs(envIds)
        this.arrangeWindows(envIds)
        return { success: true, envIds }
      }),
      this.route('GET', '/groups', () => storageService.getGroups()),
      this.route('POST', '/groups', ({ body }) => {
        const payload = assertValidation('groups-create', body)
        const group = {
          id: `grp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: payload.name,
          color: payload.color || '#3b82f6',
          order: storageService.getGroups().length,
          createdAt: new Date().toISOString(),
        }
        storageService.addGroup(group)
        activityLogService.log({ envId: 'system', action: 'create', details: `创建分组: ${group.name}` })
        return group
      }),
      this.route('PUT', '/groups/:id', ({ body, params }) => {
        const payload = assertValidation('groups-update', { id: params.id, ...body })
        const existing = storageService.getGroups().find(group => group.id === params.id)
        if (!existing) {
          throw createHttpError(404, `Group ${params.id} not found`)
        }
        storageService.updateGroup(params.id, payload)
        return storageService.getGroups().find(group => group.id === params.id)
      }),
      this.route('DELETE', '/groups/:id', ({ params }) => {
        const existing = storageService.getGroups().find(group => group.id === params.id)
        if (!existing) {
          throw createHttpError(404, `Group ${params.id} not found`)
        }
        storageService.deleteGroup(params.id)
        return { success: true }
      }),
      this.route('GET', '/proxy-groups', () => storageService.getProxyGroups()),
      this.route('POST', '/proxy-groups', ({ body }) => {
        const payload = assertValidation('proxy-groups-create', body)
        const group = {
          id: `pgrp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: payload.name,
          color: payload.color || '#3b82f6',
          order: storageService.getProxyGroups().length,
          createdAt: new Date().toISOString(),
        }
        storageService.addProxyGroup(group)
        activityLogService.log({ envId: 'system', action: 'create', details: `创建代理分组: ${group.name}` })
        return group
      }),
      this.route('PUT', '/proxy-groups/:id', ({ body, params }) => {
        const payload = assertValidation('proxy-groups-update', { id: params.id, ...body })
        const existing = storageService.getProxyGroups().find(group => group.id === params.id)
        if (!existing) {
          throw createHttpError(404, `Proxy group ${params.id} not found`)
        }
        storageService.updateProxyGroup(params.id, payload)
        return storageService.getProxyGroups().find(group => group.id === params.id)
      }),
      this.route('DELETE', '/proxy-groups/:id', ({ params }) => {
        assertValidation('proxy-groups-delete', { id: params.id })
        const existing = storageService.getProxyGroups().find(group => group.id === params.id)
        if (!existing) {
          throw createHttpError(404, `Proxy group ${params.id} not found`)
        }
        storageService.deleteProxyGroup(params.id)
        return { success: true }
      }),
      this.route('GET', '/proxies', () => storageService.getProxies()),
      this.route('POST', '/proxies', ({ body }) => {
        const payload = assertValidation('proxies-create', body)
        const proxy = {
          status: 'unchecked' as const,
          createdAt: new Date().toISOString(),
          ...payload,
          id: body?.id || `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        }
        if (proxy.groupId === '') delete (proxy as any).groupId
        storageService.addProxy(proxy as any)
        return proxy
      }),
      this.route('PUT', '/proxies/:id', ({ body, params }) => {
        const payload = assertValidation('proxies-update', { id: params.id, ...body })
        const existing = storageService.getProxies().find(proxy => proxy.id === params.id)
        if (!existing) {
          throw createHttpError(404, `Proxy ${params.id} not found`)
        }
        storageService.updateProxy(params.id, payload)
        return storageService.getProxies().find(proxy => proxy.id === params.id)
      }),
      this.route('DELETE', '/proxies/:id', ({ params }) => {
        assertValidation('proxies-delete', { id: params.id })
        const existing = storageService.getProxies().find(proxy => proxy.id === params.id)
        if (!existing) {
          throw createHttpError(404, `Proxy ${params.id} not found`)
        }
        storageService.deleteProxy(params.id)
        return { success: true }
      }),
    ]
  }

  private route(method: HttpMethod, path: string, handler: RouteHandler): Route {
    const { pattern, paramNames } = toRoutePattern(path)
    return { method, pattern, paramNames, handler }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const method = (req.method || 'GET').toUpperCase() as HttpMethod

      if (method === 'OPTIONS') {
        writeJson(res, 200, { success: true })
        return
      }

      const url = new URL(req.url || '/', `http://${LOCAL_API_HOST}:${LOCAL_API_PORT}`)
      const routeMatch = this.routes
        .map(route => {
          const match = route.method === method ? route.pattern.exec(url.pathname) : null
          return match ? { route, match } : null
        })
        .find(Boolean)

      if (!routeMatch) {
        throw createHttpError(404, `No route for ${method} ${url.pathname}`)
      }

      const body = method === 'POST' || method === 'PUT' ? await parseJsonBody(req) : {}
      const params = decodeParams(routeMatch.match, routeMatch.route.paramNames)
      const result = await routeMatch.route.handler({ body, params, url })
      writeJson(res, 200, result)
    } catch (error: any) {
      const statusCode = error?.statusCode || 500
      const message = error?.message || 'Internal server error'
      if (statusCode >= 500) {
        console.error('[LocalApiService] Request failed:', error)
      }
      writeJson(res, statusCode, {
        error: message,
        details: error?.details,
      })
    }
  }

  private ensureRunningEnvs(envIds: string[]): void {
    for (const envId of envIds) {
      const env = environmentManager.getEnvironment(envId)
      if (!env) {
        throw createHttpError(404, `Environment ${envId} not found`)
      }

      const runtime = environmentManager.getEnvironmentRuntime(envId)
      if (!runtime?.isRunning) {
        throw createHttpError(409, `Environment ${envId} is not running`)
      }
    }
  }

  private invokeWindowAction(action: 'maximize' | 'minimize', envIds: string[]): void {
    for (const envId of envIds) {
      const pid = launchService.getPid(envId)
      if (!pid) continue
      const windows = windowManager.findWindowByPid(pid)
      for (const win of windows) {
        windowManager.showWindow(win.hwnd, action)
      }
    }
  }

  private arrangeWindows(envIds: string[]): void {
    const targetWindows: Array<{ hwnd: number; title: string }> = []

    for (const envId of envIds) {
      const pid = launchService.getPid(envId)
      if (!pid) continue
      const windows = windowManager.findWindowByPid(pid)
      for (const win of windows) {
        targetWindows.push({ hwnd: win.hwnd, title: win.title })
      }
    }

    if (targetWindows.length === 0) {
      throw createHttpError(500, 'No windows found to arrange')
    }

    const monitors = windowManager.getMonitors()
    const primaryMonitor = monitors.find((monitor: any) => monitor.isPrimary) || monitors[0]
    const area = primaryMonitor?.workArea || { x: 0, y: 0, width: 1920, height: 1080 }
    const count = targetWindows.length
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)

    for (const win of targetWindows) {
      windowManager.focusWindow(win.hwnd)
    }

    setTimeout(() => {
      for (let idx = 0; idx < count; idx++) {
        const win = targetWindows[idx]
        const row = Math.floor(idx / cols)
        const col = idx % cols
        const w = Math.floor(area.width / cols)
        const h = Math.floor(area.height / rows)
        windowManager.setWindowPosition(win.hwnd, {
          x: area.x + col * w,
          y: area.y + row * h,
          width: w - 10,
          height: h - 10,
        })
      }
    }, 100)
  }
}

export const localApiService = new LocalApiService()
