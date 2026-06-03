/**
 * 指纹生成工具
 * 使用 apify/fingerprint-suite 的 fingerprint-generator 生成逼真的浏览器指纹
 */
import { FingerprintGenerator } from 'fingerprint-generator'

export interface GeneratedFingerprint {
  platform: 'windows' | 'linux' | 'macos'
  brand: 'Chrome' | 'Edge' | 'Opera' | 'Vivaldi'
  hardwareConcurrency: number
  platformVersion: string
  brandVersion: string
}

// 浏览器名称映射：fingerprint-generator 的名称 → 我们的枚举
const BROWSER_MAP: Record<string, GeneratedFingerprint['brand']> = {
  chrome: 'Chrome',
  edge: 'Edge',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
}

// 操作系统映射
const OS_MAP: Record<string, GeneratedFingerprint['platform']> = {
  windows: 'windows',
  linux: 'linux',
  macos: 'macos',
}

/**
 * 从 navigator.platform 反推操作系统
 */
function inferPlatform(navPlatform: string): GeneratedFingerprint['platform'] {
  const lower = navPlatform.toLowerCase()
  if (lower.includes('win')) return 'windows'
  if (lower.includes('mac')) return 'macos'
  return 'linux'
}

/**
 * 生成一个逼真的指纹配置
 * 返回 platform, brand, hardwareConcurrency, platformVersion, brandVersion
 */
export function generateFingerprint(): GeneratedFingerprint {
  const generator = new FingerprintGenerator({
    browsers: [{ name: 'chrome', minVersion: 120 }],
    devices: ['desktop'],
    operatingSystems: ['windows', 'macos', 'linux'],
  })

  const { fingerprint } = generator.getFingerprint()

  // 解析 navigator.userAgent 获取品牌和版本
  const userAgent = fingerprint.navigator?.userAgent || ''
  let brand: GeneratedFingerprint['brand'] = 'Chrome'
  let brandVersion = '120.0.0.0'

  // 尝试从 userAgent 解析浏览器品牌
  if (userAgent.includes('Edg/')) {
    brand = 'Edge'
    const match = userAgent.match(/Edg\/([\d.]+)/)
    if (match) brandVersion = match[1]
  } else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) {
    brand = 'Opera'
    const match = userAgent.match(/(?:OPR|Opera)\/([\d.]+)/)
    if (match) brandVersion = match[1]
  } else if (userAgent.includes('Vivaldi/')) {
    brand = 'Vivaldi'
    const match = userAgent.match(/Vivaldi\/([\d.]+)/)
    if (match) brandVersion = match[1]
  } else if (userAgent.includes('Chrome/')) {
    brand = 'Chrome'
    const match = userAgent.match(/Chrome\/([\d.]+)/)
    if (match) brandVersion = match[1]
  }

  // 平台
  const platform = inferPlatform(fingerprint.navigator?.platform || 'Win32')

  // 平台版本（从 userAgent 提取）
  let platformVersion = ''
  if (platform === 'windows') {
    const match = userAgent.match(/Windows NT ([\d.]+)/)
    platformVersion = match ? match[1] : '10.0.19045'
  } else if (platform === 'macos') {
    const match = userAgent.match(/Mac OS X ([\d_]+)/)
    platformVersion = match ? match[1].replace(/_/g, '.') : '10.15.7'
  } else {
    platformVersion = '5.15.0'
  }

  // CPU 核心数
  const hardwareConcurrency = fingerprint.navigator?.hardwareConcurrency || 4

  return {
    platform,
    brand,
    hardwareConcurrency,
    platformVersion,
    brandVersion,
  }
}
