/**
 * 代理分组类型定义
 * 与环境分组（Group）独立，用于代理池分类管理
 */

export interface ProxyGroup {
  id: string
  name: string
  color: string
  order: number
  createdAt: string
}
