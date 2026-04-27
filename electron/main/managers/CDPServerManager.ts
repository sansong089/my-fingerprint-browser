// CDP Server Manager - manages CDP debugging ports
import { storageService } from '../services/StorageService'

class CDPServerManager {
  private activeConnections: Map<string, any> = new Map()

  // Get CDP address for environment
  getCDPAddress(envId: string): string {
    const environments = storageService.getEnvironments()
    const env = environments.find(e => e.id === envId)
    if (!env) return ''
    return `127.0.0.1:${env.cdpPort}`
  }

  // Check if CDP port is available
  isPortAvailable(port: number): boolean {
    const environments = storageService.getEnvironments()
    return !environments.some(e => e.cdpPort === port)
  }

  // Get next available port
  getAvailablePort(start: number = 9222, end: number = 9322): number {
    const environments = storageService.getEnvironments()
    const usedPorts = new Set(environments.map(e => e.cdpPort))
    
    for (let port = start; port <= end; port++) {
      if (!usedPorts.has(port)) {
        return port
      }
    }
    
    return start
  }

  // Register CDP connection
  registerConnection(envId: string, connection: any): void {
    this.activeConnections.set(envId, connection)
  }

  // Get CDP connection
  getConnection(envId: string): any | undefined {
    return this.activeConnections.get(envId)
  }

  // Remove CDP connection
  removeConnection(envId: string): void {
    this.activeConnections.delete(envId)
  }

  // Get all active connections
  getActiveConnections(): string[] {
    return Array.from(this.activeConnections.keys())
  }
}

export const cdpServerManager = new CDPServerManager()
export default CDPServerManager