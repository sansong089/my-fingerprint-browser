// chrome-remote-interface 类型声明（可选依赖）
declare module 'chrome-remote-interface' {
  interface ChromeRemoteInterface {
    send(method: string, params?: object): Promise<any>
    on(event: string, callback: (...args: any[]) => void): void
    close(): Promise<void>
  }
  type CRIOptions = { port?: number; local?: boolean; [key: string]: any }

  export default function cri(options?: CRIOptions): Promise<ChromeRemoteInterface>
  export function cri(options?: CRIOptions): Promise<ChromeRemoteInterface>
}
