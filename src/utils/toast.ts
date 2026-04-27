type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastApi {
  show: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

let toastApi: ToastApi | null = null

export function registerToast(api: ToastApi) {
  toastApi = api
}

export function unregisterToast(api?: ToastApi) {
  if (!api || toastApi === api) toastApi = null
}

function writeConsoleToast(message: string, type: ToastType) {
  const prefix = `[toast:${type}]`
  if (type === 'error') console.error(prefix, message)
  else console.log(prefix, message)
}

export const toast = {
  show(message: string, type: ToastType = 'info', duration = 3000) {
    if (toastApi) toastApi.show(message, type, duration)
    else writeConsoleToast(message, type)
  },
  success(message: string) {
    if (toastApi) toastApi.success(message)
    else writeConsoleToast(message, 'success')
  },
  error(message: string) {
    if (toastApi) toastApi.error(message)
    else writeConsoleToast(message, 'error')
  },
  warning(message: string) {
    if (toastApi) toastApi.warning(message)
    else writeConsoleToast(message, 'warning')
  },
  info(message: string) {
    if (toastApi) toastApi.info(message)
    else writeConsoleToast(message, 'info')
  },
}
