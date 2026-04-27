/**
 * 12 色精选色板
 * 排除纯红(#ff0000)/纯绿(#00ff00)，保证视觉区分度
 */

export const ENV_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500（深红，非纯红）
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#a855f7', // purple-500
  '#eab308', // yellow-500
] as const

export type EnvColor = (typeof ENV_COLORS)[number]

/** 随机获取一个环境颜色 */
export function getRandomEnvColor(): EnvColor {
  return ENV_COLORS[Math.floor(Math.random() * ENV_COLORS.length)]
}
