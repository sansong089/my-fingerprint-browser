/**
 * 统一 IPC 调用管道
 *
 * - 自动设置 loading 状态
 * - 统一错误处理（网络错误 vs 业务错误）
 * - 返回类型安全
 */

export interface IpcActionOptions {
  retryCount?: number
  loadingKey?: string
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}

export function createIpcAction<TParams, TResult>(
  channel: string,
  options?: IpcActionOptions,
) {
  return async (
    { commit }: { commit: (type: string, payload: any) => void },
    params: TParams,
  ): Promise<TResult> => {
    const loadingKey = options?.loadingKey ?? channel
    commit('SET_LOADING', { key: loadingKey, value: true })

    try {
      const result = await window.electronAPI.invoke<TResult>(channel, params)
      return result
    } catch (error) {
      commit('SET_ERROR', { key: channel, value: errorMessage(error) })
      throw error
    } finally {
      commit('SET_LOADING', { key: loadingKey, value: false })
    }
  }
}
