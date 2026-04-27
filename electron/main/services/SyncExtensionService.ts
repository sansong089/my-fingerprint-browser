import { app } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'

interface SyncStateLike {
  active: boolean
  mainEnvId: string | null
  mirrorEnvIds: string[]
}

interface TextSnapshot {
  envId: string
  url?: string
  frameUrl?: string
  selector?: string
  kind?: 'input' | 'textarea' | 'contenteditable'
  tagName?: string
  type?: string
  value?: string
  selectionStart?: number | null
  selectionEnd?: number | null
  inputType?: string
  at?: number
}

interface TextCommand {
  seq: number
  type: 'apply-text-snapshot'
  sourceEnvId: string
  payload: TextSnapshot
}

class SyncExtensionService {
  private server: Server | null = null
  private port = 19731
  private starting: Promise<number> | null = null
  private queues: Map<string, TextCommand[]> = new Map()
  private nextSeq = 1
  private syncStateProvider: () => SyncStateLike = () => ({
    active: false,
    mainEnvId: null,
    mirrorEnvIds: [],
  })

  setSyncStateProvider(provider: () => SyncStateLike): void {
    this.syncStateProvider = provider
  }

  resetQueues(): void {
    this.queues.clear()
    this.nextSeq = 1
  }

  getPort(): number {
    return this.port
  }

  async ensureStarted(): Promise<number> {
    if (this.server) return this.port
    if (this.starting) return this.starting

    this.starting = this.listenWithPortSearch(19731, 20).finally(() => {
      this.starting = null
    })
    return this.starting
  }

  async prepareExtension(envId: string): Promise<string> {
    const port = await this.ensureStarted()
    const extensionDir = join(app.getPath('userData'), 'sync-extension', this.safePathPart(envId))
    mkdirSync(extensionDir, { recursive: true })

    writeFileSync(join(extensionDir, 'manifest.json'), this.buildManifest(), 'utf8')
    writeFileSync(join(extensionDir, 'config.js'), this.buildConfig(envId, port), 'utf8')
    writeFileSync(join(extensionDir, 'background.js'), this.buildBackgroundScript(), 'utf8')
    writeFileSync(join(extensionDir, 'content.js'), this.buildContentScript(), 'utf8')

    return extensionDir
  }

  private listenWithPortSearch(basePort: number, attempts: number): Promise<number> {
    return new Promise((resolve, reject) => {
      let offset = 0

      const tryListen = () => {
        const port = basePort + offset
        const server = createServer((req, res) => this.handleRequest(req, res))

        server.once('error', (error: any) => {
          server.close()
          if (error?.code === 'EADDRINUSE' && offset < attempts) {
            offset += 1
            tryListen()
            return
          }
          reject(error)
        })

        server.listen(port, '127.0.0.1', () => {
          this.server = server
          this.port = port
          console.log(`[SyncExtensionService] Listening on 127.0.0.1:${port}`)
          resolve(port)
        })
      }

      tryListen()
    })
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`)

    try {
      if (req.method === 'POST' && url.pathname === '/event') {
        const body = await this.readJson(req)
        this.handleTextSnapshot(body as TextSnapshot)
        this.sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && url.pathname === '/commands') {
        const envId = url.searchParams.get('envId') || ''
        const since = Number(url.searchParams.get('since') || '0')
        const commands = this.getCommands(envId, since)
        this.sendJson(res, 200, {
          ok: true,
          nextSeq: commands.length ? commands[commands.length - 1].seq : since,
          commands,
        })
        return
      }

      this.sendJson(res, 404, { ok: false, error: 'not_found' })
    } catch (error: any) {
      console.warn('[SyncExtensionService] Request failed:', error?.message || error)
      this.sendJson(res, 500, { ok: false, error: 'internal_error' })
    }
  }

  private handleTextSnapshot(snapshot: TextSnapshot): void {
    const state = this.syncStateProvider()
    if (!state.active || !state.mainEnvId || snapshot.envId !== state.mainEnvId) {
      return
    }

    if (!snapshot.selector || typeof snapshot.value !== 'string') {
      return
    }

    for (const mirrorEnvId of state.mirrorEnvIds) {
      if (!mirrorEnvId || mirrorEnvId === snapshot.envId) continue

      const command: TextCommand = {
        seq: this.nextSeq++,
        type: 'apply-text-snapshot',
        sourceEnvId: snapshot.envId,
        payload: { ...snapshot, at: Date.now() },
      }

      const queue = this.queues.get(mirrorEnvId) || []
      queue.push(command)
      if (queue.length > 200) queue.splice(0, queue.length - 200)
      this.queues.set(mirrorEnvId, queue)
    }
  }

  private getCommands(envId: string, since: number): TextCommand[] {
    if (!envId) return []
    const queue = this.queues.get(envId) || []
    return queue.filter(command => command.seq > since)
  }

  private readJson(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', chunk => {
        body += chunk
        if (body.length > 1024 * 1024) {
          reject(new Error('request_too_large'))
          req.destroy()
        }
      })
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {})
        } catch (error) {
          reject(error)
        }
      })
      req.on('error', reject)
    })
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }

  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')
  }

  private safePathPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'unknown'
  }

  private buildManifest(): string {
    return JSON.stringify({
      manifest_version: 3,
      name: 'Fingerprint Browser Sync Bridge',
      version: '0.1.0',
      description: 'Mirrors committed page text snapshots for window sync.',
      permissions: ['tabs'],
      host_permissions: ['<all_urls>', 'http://127.0.0.1:*/*'],
      background: {
        service_worker: 'background.js',
      },
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['content.js'],
          all_frames: true,
          run_at: 'document_start',
        },
      ],
    }, null, 2)
  }

  private buildConfig(envId: string, port: number): string {
    return `self.SYNC_EXTENSION_CONFIG = ${JSON.stringify({ envId, port })};\n`
  }

  private buildBackgroundScript(): string {
    return String.raw`importScripts('config.js');

const CONFIG = self.SYNC_EXTENSION_CONFIG;
let since = 0;

async function postSnapshot(snapshot) {
  await fetch(` + "`http://127.0.0.1:${CONFIG.port}/event`" + `, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...snapshot, envId: CONFIG.envId }),
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'sync-text-snapshot') return false;

  postSnapshot(message.payload)
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, error: String(error && error.message || error) }));

  return true;
});

function broadcastCommand(command) {
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const maybePromise = chrome.tabs.sendMessage(tab.id, { type: 'sync-apply-text', command });
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => {});
        }
      } catch {}
    }
  });
}

async function pollCommands() {
  try {
    const res = await fetch(` + "`http://127.0.0.1:${CONFIG.port}/commands?envId=${encodeURIComponent(CONFIG.envId)}&since=${since}`" + `);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.commands)) {
        for (const command of data.commands) {
          broadcastCommand(command);
        }
      }
      if (Number.isFinite(data.nextSeq)) {
        since = data.nextSeq;
      }
    }
  } catch {
    // The Electron bridge may not be ready yet. Keep polling the same channel.
  } finally {
    setTimeout(pollCommands, 150);
  }
}

pollCommands();
`
  }

  private buildContentScript(): string {
    return String.raw`(() => {
  let composing = false;
  let applying = false;
  let pendingTimer = 0;

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, char => '\\' + char);
  }

  function isEditableElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node;
    const tagName = element.tagName ? element.tagName.toLowerCase() : '';
    if (tagName === 'textarea') return true;
    if (tagName === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    }
    return Boolean(element.isContentEditable);
  }

  function closestEditable(node) {
    let current = node && node.nodeType === Node.ELEMENT_NODE ? node : document.activeElement;
    while (current && current !== document.documentElement) {
      if (isEditableElement(current)) return current;
      current = current.parentElement;
    }
    return isEditableElement(document.activeElement) ? document.activeElement : null;
  }

  function selectorFor(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    if (element.id) return '#' + cssEscape(element.id);

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement && parts.length < 8) {
      const tag = current.tagName.toLowerCase();
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      current = current.parentElement;
    }
    return parts.length ? parts.join(' > ') : '';
  }

  function snapshotFor(element, inputType) {
    const tagName = element.tagName.toLowerCase();
    const contentEditable = element.isContentEditable && tagName !== 'input' && tagName !== 'textarea';
    const value = contentEditable ? element.textContent || '' : element.value;

    return {
      url: location.href,
      frameUrl: location.href,
      selector: selectorFor(element),
      kind: contentEditable ? 'contenteditable' : tagName,
      tagName,
      type: element.getAttribute('type') || '',
      value,
      selectionStart: typeof element.selectionStart === 'number' ? element.selectionStart : null,
      selectionEnd: typeof element.selectionEnd === 'number' ? element.selectionEnd : null,
      inputType: inputType || '',
    };
  }

  function scheduleSnapshot(target, inputType, delay) {
    if (applying) return;
    const element = closestEditable(target);
    if (!element) return;

    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      if (applying) return;
      const payload = snapshotFor(element, inputType);
      if (!payload.selector || typeof payload.value !== 'string') return;
      chrome.runtime.sendMessage({ type: 'sync-text-snapshot', payload }).catch(() => {});
    }, delay);
  }

  function applySnapshot(payload) {
    if (!payload || !payload.selector || typeof payload.value !== 'string') return;
    const element = document.querySelector(payload.selector);
    if (!element || !isEditableElement(element)) return;

    applying = true;
    try {
      if (payload.kind === 'contenteditable' || (element.isContentEditable && element.tagName.toLowerCase() !== 'input' && element.tagName.toLowerCase() !== 'textarea')) {
        if (element.textContent !== payload.value) {
          element.textContent = payload.value;
        }
      } else if ('value' in element) {
        if (element.value !== payload.value) {
          element.value = payload.value;
        }
        if (typeof element.setSelectionRange === 'function' && payload.selectionStart !== null && payload.selectionEnd !== null) {
          try {
            element.setSelectionRange(payload.selectionStart, payload.selectionEnd);
          } catch {}
        }
      }

      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: payload.inputType || 'insertReplacementText',
        data: null,
      }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      setTimeout(() => {
        applying = false;
      }, 0);
    }
  }

  document.addEventListener('compositionstart', event => {
    composing = true;
    scheduleSnapshot(event.target, 'compositionstart', 30);
  }, true);

  document.addEventListener('compositionend', event => {
    composing = false;
    scheduleSnapshot(event.target, 'compositionend', 20);
  }, true);

  document.addEventListener('beforeinput', event => {
    if (!composing) scheduleSnapshot(event.target, event.inputType || 'beforeinput', 30);
  }, true);

  document.addEventListener('input', event => {
    scheduleSnapshot(event.target, event.inputType || 'input', composing ? 80 : 20);
  }, true);

  document.addEventListener('selectionchange', () => {
    if (!composing) scheduleSnapshot(document.activeElement, 'selectionchange', 120);
  }, true);

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'sync-apply-text') return;
    const command = message.command;
    if (!command || command.type !== 'apply-text-snapshot') return;
    applySnapshot(command.payload);
  });
})();
`
  }
}

export const syncExtensionService = new SyncExtensionService()
export default SyncExtensionService
