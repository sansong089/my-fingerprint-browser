/**
 * IPCValidator — IPC 参数校验
 *
 * 所有 IPC handler 入口通过 validate() 校验参数类型，防止恶意调用。
 * 使用 zod schema 定义每个通道的参数格式。
 */

// 当前项目使用内置 schema 定义，避免运行时依赖额外校验库。
interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required?: boolean
  min?: number
  max?: number
}

interface ChannelSchema {
  [field: string]: FieldSchema
}

/** 简易校验 */
function validateBasic(params: unknown, schema: ChannelSchema): { valid: boolean; error?: string } {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'params must be an object' }
  }

  for (const [field, rule] of Object.entries(schema)) {
    const value = (params as any)[field]

    if (rule.required && value === undefined) {
      return { valid: false, error: `Missing required field: ${field}` }
    }
    if (value === undefined) continue // 可选字段跳过

    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') return { valid: false, error: `${field} must be string` }
        if (rule.min !== undefined && value.length < rule.min) return { valid: false, error: `${field} too short` }
        if (rule.max !== undefined && value.length > rule.max) return { valid: false, error: `${field} too long` }
        break
      case 'number':
        if (typeof value !== 'number') return { valid: false, error: `${field} must be number` }
        break
      case 'boolean':
        if (typeof value !== 'boolean') return { valid: false, error: `${field} must be boolean` }
        break
      case 'array':
        if (!Array.isArray(value)) return { valid: false, error: `${field} must be array` }
        break
    }
  }

  return { valid: true }
}

const schemas: Record<string, ChannelSchema> = {
  'create-environment': {
    name: { type: 'string', min: 1, max: 100 },
  },
  'update-environment': {
    id: { type: 'string', required: true, min: 1 },
  },
  'delete-environment': {
    id: { type: 'string', required: true },
  },
  'launch-browser': {
    envId: { type: 'string', required: true },
  },
  'close-browser': {
    envId: { type: 'string', required: true },
  },
  'batch-launch': {
    envIds: { type: 'array', required: true },
  },
  'batch-close': {
    envIds: { type: 'array', required: true },
  },
  'groups-create': {
    name: { type: 'string', min: 1, max: 50 },
    color: { type: 'string' },
  },
  'proxy-groups-create': {
    name: { type: 'string', min: 1, max: 50 },
    color: { type: 'string' },
  },
  'proxy-groups-update': {
    id: { type: 'string', required: true, min: 1 },
    name: { type: 'string', min: 1, max: 50 },
    color: { type: 'string' },
  },
  'proxy-groups-delete': {
    id: { type: 'string', required: true, min: 1 },
  },
  'proxies-create': {
    name: { type: 'string', min: 1, max: 100 },
    type: { type: 'string' },
    host: { type: 'string', min: 1, max: 255 },
    port: { type: 'number' },
  },
  'proxies-update': {
    id: { type: 'string', required: true, min: 1 },
    name: { type: 'string', min: 1, max: 100 },
    type: { type: 'string' },
    host: { type: 'string', min: 1, max: 255 },
    port: { type: 'number' },
  },
  'proxies-delete': {
    id: { type: 'string', required: true, min: 1 },
  },
  'save-settings': {
    browserPath: { type: 'string' },
    defaultPlatform: { type: 'string' },
  },
  'start-sync': {
    envIds: { type: 'array', required: true },
  },
  'activity-logs': {
    envId: { type: 'string' },
    limit: { type: 'number' },
  },
  'plugins-install': {
    storeUrl: { type: 'string', required: true, min: 10 },
    name: { type: 'string' },
    iconUrl: { type: 'string' },
    description: { type: 'string' },
  },
  'plugins-uninstall': {
    pluginId: { type: 'string', required: true, min: 1 },
  },
  'plugins-reinstall-missing': {
    pluginId: { type: 'string', required: true, min: 1 },
  },
}

function validate(channel: string, params: unknown):
  | { success: true; data: any }
  | { success: false; error: string } {
  const schema = schemas[channel]
  if (!schema) {
    return { success: true, data: params } // 无 schema 的通道放行（兼容旧接口）
  }

  const result = validateBasic(params, schema)
  if (!result.valid) {
    console.error(`[IPCValidator] ${channel}: ${result.error}`)
    return { success: false, error: `Invalid params for ${channel}: ${result.error}` }
  }

  return { success: true, data: params }
}

export default { validate, schemas }
export { validate }
