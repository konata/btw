import type { ComponentType } from 'react'
import { en, zh, type Translate } from './locales.ts'

const TAB = 'btw'
const PROTOCOL = 'btw'

export const inject = ['sessions', 'uiSession', 'resources', 'sidebarRightTabs', 'sidebarRight', 'slots', 'commandUi', 'shortcuts', 'locale']
const PREFIX = 'dsh-resource://'

interface Snapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

interface SessionReference {
  readonly ready: Promise<void>
  release(): void
}

interface Address {
  childId: string
  parent: string
}

export interface ClientContext {
  sessions: {
    list: Snapshot<{ current?: string; phase?: string; byId?: Record<string, unknown> }>
    retain(target: string, options: { source: string; signal?: AbortSignal }): SessionReference
    refresh(): Promise<void>
  }
  uiSession: { adapter?: { current: Snapshot<{ key?: string }> } }
  resources: {
    register(provider: {
      protocol: string
      open(address: string, options: { signal: AbortSignal }): AsyncGenerator<{ ok: true; value: { reference: SessionReference } }>
    }): () => void
  }
  sidebarRightTabs: {
    register(tab: {
      id: string
      kind: string
      patterns?: string[]
      canOpen?(address: string): boolean
      title(address: string): string
      guide?: Array<{ id: string; order: number; commandId?: string; title(): string; description?(): string }>
    }): () => void
  }
  sidebarRight: {
    openResource(address: string, options?: { kind?: string }): void
    registerCloseHandler(kind: string, handler: (sessionId: string, tab: { contentId: string }) => void): () => void
  }
  slots: {
    inject(name: string, fn: () => () => void): void
    register(definition: {
      name: string
      key?: string
      children?: Record<string, { kind: 'single'; scope: 'session' }>
    }, body: ComponentType<any>): () => void
  }
  locale: {
    register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
    bind(namespace: string): (key: string) => string
  }
  commandUi: { register(command: { name: string; label(): string; description?(): string; available(session: { sessionId: string }): boolean; ui: { kind: 'action'; run(session: { sessionId: string }): void } }): () => void }
  shortcuts: {
    register(command: {
      id: string
      label(): string
      aliases?: readonly string[]
      defaults: Record<string, { code: string; modifiers: readonly string[] }>
      regions?: readonly string[]
      modals?: readonly string[]
      resolve(context: unknown): { status: 'handled'; run(): void } | { status: 'blocked'; reason: string }
    }): () => void
  }
  inject(deps: string[], fn: (scope: ClientContext) => void): void
  effect(fn: () => void | (() => void), label?: string): void
}

const CSS = `
.btw { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); }
.btw-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 0; }
.btw-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 18px; }
.btw-new { display: flex; flex: none; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: .5px solid var(--dsw-alias-border-l4, rgba(0,0,0,.16)); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary, #61666b); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
.btw-new:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); }
.btw-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.btw-body > * { flex: 1 1 auto; min-height: 0; }
.btw-loading { margin: 0; padding: 16px; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 18px; }
`

const current = (ctx: ClientContext): string | undefined =>
  ctx.uiSession.adapter?.current.getSnapshot().key ?? ctx.sessions.list.getSnapshot().current

const addressOf = (childId: string, parent: string): string =>
  `${PREFIX}${PROTOCOL}/session/${encodeURIComponent(childId)}?parent=${encodeURIComponent(parent)}`

const parseAddress = (address: string): Address | undefined => {
  try {
    const url = new URL(address)
    if (url.protocol !== 'dsh-resource:' || url.hostname !== PROTOCOL) return undefined
    const childId = decodeURIComponent(url.pathname.replace(/^\/session\//u, ''))
    if (childId === '') return undefined
    return { childId, parent: url.searchParams.get('parent') ?? '' }
  } catch {
    return undefined
  }
}

const call = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
  const response = await fetch(`/btw/api/${path}`, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : response.statusText)
  return value
}

const reportFailure = (error: unknown): void => {
  void fetch('/btw/api/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : '' }),
  }).catch(() => {})
}

const waitForAbort = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })

/** Fixed Chat selection used by an embedded Conversation occurrence. */
const FixedChat = (props: { renderSlot(name: string, props: Record<string, unknown>): any }): any =>
  props.renderSlot('conversation.session', { view: 'chat' })

/** Render the shared Conversation content for the Session the provider bound. */
const Conversation = (props: { useSession(selector: (value: any) => any): any; renderFactorySlot(name: string, props: Record<string, unknown>, options: Record<string, unknown>): any }): any => {
  const session = props.useSession((value) => value)
  const blank = session.blank === true && session.running !== true
  return props.renderFactorySlot('conversation.content', {
    variant: 'embedded',
    phase: blank ? 'hero' : 'active',
    hero: blank,
  }, { slots: { views: FixedChat } })
}

export function apply(ctx: ClientContext): void {
  const guard = (run: () => void): void => {
    try {
      run()
    } catch (error) {
      reportFailure(error)
    }
  }

  guard(() => ctx.effect(() => ctx.locale.register('btw', { zh, en }), 'btw: dictionaries'))
  const t = ctx.locale.bind('btw') as Translate
  const titles = new Map<string, string>()

  const retain = async (childId: string, signal: AbortSignal): Promise<SessionReference> => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (signal.aborted) throw new Error('the side chat tab closed before it opened')
      if (ctx.sessions.list.getSnapshot().phase === 'ready' || attempt >= 4) {
        try {
          return ctx.sessions.retain(childId, { source: PROTOCOL, signal })
        } catch (error) {
          if (attempt === 39) throw error
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error('the side chat session never appeared')
  }

  const openChat = (childId: string, parent: string): void => {
    ctx.sidebarRight.openResource(addressOf(childId, parent), { kind: TAB })
  }

  const startChat = async (): Promise<void> => {
    const parent = current(ctx)
    if (parent === undefined) return
    try {
      const value = await call('start', { parentSessionId: parent })
      if (typeof value.childId !== 'string') throw new Error(t('error.create'))
      titles.set(value.childId, typeof value.title === 'string' ? value.title : '')
      await ctx.sessions.refresh().catch(() => {})
      openChat(value.childId, parent)
    } catch (error) {
      reportFailure(error)
    }
  }

  const openLatest = async (): Promise<void> => {
    const parent = current(ctx)
    if (parent === undefined) return
    try {
      const value = await call(`state?parentSessionId=${encodeURIComponent(parent)}`)
      const chats = Array.isArray(value.chats) ? value.chats as Array<Record<string, unknown>> : []
      for (const chat of chats) {
        if (typeof chat.childId === 'string' && typeof chat.title === 'string' && chat.title !== '') titles.set(chat.childId, chat.title)
      }
      const latest = chats.at(-1)
      if (latest !== undefined && typeof latest.childId === 'string') openChat(latest.childId, parent)
      else await startChat()
    } catch (error) {
      reportFailure(error)
    }
  }

  guard(() => ctx.effect(() => ctx.resources.register({
    protocol: PROTOCOL,
    async *open(address, { signal }) {
      const parsed = parseAddress(address)
      if (parsed === undefined) throw new Error(`btw: invalid chat address "${address}"`)
      // A restored tab can open before the host has re-registered its chats.
      await fetch(`/btw/api/state?parentSessionId=${encodeURIComponent(parsed.parent)}`, { signal }).catch(() => {})
      await ctx.sessions.refresh().catch(() => {})
      const response = await fetch('/btw/api/attach', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ childId: parsed.childId }),
        signal,
      })
      if (!response.ok) throw new Error(`btw: could not attach the side chat (${String(response.status)})`)
      const value = await response.json() as Record<string, unknown>
      if (typeof value.title === 'string' && value.title !== '') titles.set(parsed.childId, value.title)
      const reference = await retain(parsed.childId, signal)
      try {
        yield { ok: true, value: { reference } }
        await waitForAbort(signal)
      } finally {
        reference.release()
      }
    },
  }), 'btw: chat resources'))

  function ChatTab(props: {
    useResource(contentId: string): { value?: { reference: SessionReference } }
    useTabInfo(): { tab: { contentId: string } }
    SessionProvider: ComponentType<{ session: SessionReference; children?: unknown }>
    renderSlot(name: string, props: Record<string, unknown>): unknown
  }): any {
    const { tab } = props.useTabInfo()
    const resource = props.useResource(tab.contentId)
    const parsed = parseAddress(tab.contentId)
    const title = parsed === undefined ? '' : titles.get(parsed.childId) ?? ''
    return (
      <div className="btw">
        <div className="btw-head">
          <span className="btw-title">{title === '' ? t('tab.title') : title}</span>
          <button type="button" className="btw-new" title={t('panel.new')} aria-label={t('panel.new')} onClick={() => { void startChat() }}>+</button>
        </div>
        <div className="btw-body">
          {resource.value === undefined
            ? <p className="btw-loading">{t('panel.loading')}</p>
            : (
              <props.SessionProvider session={resource.value.reference}>
                {props.renderSlot('btw.conversation', {})}
              </props.SessionProvider>
            )}
        </div>
      </div>
    )
  }

  guard(() => ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB,
    children: { 'btw.conversation': { kind: 'single', scope: 'session' } },
  }, ChatTab)), 'btw: chat tab body'))

  guard(() => ctx.effect(() => ctx.slots.inject('btw.conversation', () => ctx.slots.register(
    { name: 'btw.conversation' },
    Conversation,
  )), 'btw: conversation slot'))

  guard(() => ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB,
    kind: TAB,
    patterns: [`${PREFIX}${PROTOCOL}/session/**`],
    canOpen: (address) => parseAddress(address) !== undefined,
    title: (address) => {
      const parsed = parseAddress(address)
      return parsed === undefined ? t('tab.title') : titles.get(parsed.childId) ?? t('tab.title')
    },
    guide: [{ id: TAB, order: 10, commandId: 'btw.open', title: () => t('tab.title'), description: () => t('guide.description') }],
  }), 'btw: chat tab type'))

  guard(() => ctx.effect(() => ctx.sidebarRight.registerCloseHandler(TAB, (_sessionId, tab) => {
    const parsed = parseAddress(tab.contentId)
    if (parsed === undefined) return
    titles.delete(parsed.childId)
    void call('close', { childId: parsed.childId }).catch(() => {})
  }), 'btw: close handler'))

  guard(() => ctx.inject(['commandUi'], (scope) => {
    guard(() => scope.effect(() => scope.commandUi.register({
      name: 'side',
      label: () => t('command.side'),
      description: () => t('command.description'),
      available: () => true,
      ui: { kind: 'action', run: () => { void openLatest() } },
    }), 'btw: /side'))
    guard(() => scope.effect(() => scope.commandUi.register({
      name: 'btw',
      label: () => t('command.btw'),
      description: () => t('command.description'),
      available: () => true,
      ui: { kind: 'action', run: () => { void openLatest() } },
    }), 'btw: /btw'))
  }))

  const binding = { code: 'KeyS', modifiers: ['primary', 'alt'] as const }
  guard(() => ctx.inject(['shortcuts'], (scope) => {
    guard(() => scope.effect(() => scope.shortcuts.register({
      id: 'btw.open',
      label: () => t('shortcut.open'),
      aliases: ['btw', 'side chat'],
      defaults: {
        'desktop:macos': binding,
        'desktop:windows': binding,
        'desktop:linux': binding,
        'web:macos': binding,
        'web:windows': binding,
      },
      regions: ['page', 'editable'],
      modals: [],
      resolve: () => current(scope) === undefined
        ? { status: 'blocked', reason: t('error.noSession') }
        : { status: 'handled', run: () => { void openLatest() } },
    }), 'btw: shortcut'))
  }))

  guard(() => ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.btw = ''
    style.textContent = CSS
    document.head.append(style)
    return () => { style.remove() }
  }, 'btw: styles'))

  void fetch('/btw/api/client-ready', { method: 'POST' }).catch(() => {})
}
