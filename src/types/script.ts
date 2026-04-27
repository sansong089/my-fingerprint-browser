/**
 * 脚本类型定义
 */

export interface ScriptStep {
  type: 'click' | 'input' | 'scroll' | 'navigate' | 'wait'
  selector?: string
  value?: string
  offsetX?: number
  offsetY?: number
  delay: number
}

export interface Script {
  id: string
  name: string
  description?: string
  steps: ScriptStep[]
  createdAt: string
  updatedAt: string
}
