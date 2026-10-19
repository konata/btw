import { useEffect, useRef, useState, type ComponentType } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Line } from '../digest.ts'
import { en, zh, type Translate } from './locales.ts'

const TAB = 'btw'
const FOCUS = 'btw:focus'
const NEW = 'btw:new'

const CSS = `
.btw { display: flex; flex-direction: column; height: 100%; min-height: 0; font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: 14px; line-height: 24px; color: var(--dsw-alias-label-primary, #0f1115); }
.btw-bar { display: flex; align-items: center; gap: 6px; padding: 10px 12px 0; }
.btw-chats { display: flex; flex: 1; min-width: 0; gap: 6px; overflow-x: auto; overscroll-behavior-x: contain; padding-bottom: 2px; scrollbar-width: none; }
.btw-chats::-webkit-scrollbar { display: none; }
.btw-chip { display: flex; flex: none; align-items: center; gap: 6px; max-width: 160px; padding: 3px 10px; border: .5px solid var(--dsw-alias-border-l4, rgba(0,0,0,.16)); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary, #61666b); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; }
.btw-chip[data-active] { border-color: transparent; background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); color: var(--dsw-alias-label-primary, #0f1115); }
.btw-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btw-dot { flex: none; width: 6px; height: 6px; border-radius: 999px; background: var(--dsw-alias-state-business-primary, #4176e6); }
.btw-new { display: flex; flex: none; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: .5px solid var(--dsw-alias-border-l4, rgba(0,0,0,.16)); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary, #61666b); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
.btw-new:hover, .btw-new[data-active] { background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); color: var(--dsw-alias-label-primary, #0f1115); border-color: transparent; }
.btw-flow { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.btw-context, .btw-empty { margin: 0; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 18px; }
.btw-msg { white-space: pre-wrap; overflow-wrap: anywhere; }
.btw-user { align-self: flex-end; max-width: 88%; padding: 8px 12px; border-radius: var(--dsw-radius-xl, 20px); background: var(--dsw-specific-bubble, #edf3fe); }
.btw-assistant { align-self: stretch; color: var(--dsw-alias-label-primary, #0f1115); }
.btw-queued { opacity: .55; }
.btw-queue-label { align-self: flex-end; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 18px; }
.btw-running { color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 18px; }
.btw-error { color: var(--dsw-alias-state-error-primary, #d54941); font-size: 12px; line-height: 18px; }
.btw-compose { box-sizing: border-box; display: flex; align-items: flex-end; gap: 8px; margin: 8px 12px 12px; padding: 5px 5px 5px 12px; border: .5px solid var(--dsw-alias-border-l4, rgba(0,0,0,.16)); border-radius: var(--dsw-radius-xl, 20px); background: var(--dsw-specific-input-major, #fff); transition: border-color .12s; }
.btw-compose:focus-within { border-color: var(--dsw-alias-state-business-primary, #4176e6); }
.btw-input { box-sizing: border-box; flex: 1; min-width: 0; min-height: 24px; max-height: 160px; padding: 5px 0; border: 0; outline: none; resize: none; background: transparent; color: var(--dsw-alias-label-primary, #0f1115); caret-color: var(--dsw-alias-state-business-primary, #4176e6); font: inherit; }
.btw-input::placeholder { color: var(--dsw-alias-label-caption, #adb2b8); }
.btw-send, .btw-stop { flex: none; height: 30px; padding: 0 14px; border-radius: 999px; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.btw-send { border: 0; background: var(--dsw-alias-button-info-fill, #4176e6); color: #fff; transition: background-color .1s; }
.btw-send:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #7aaaff); }
.btw-send:disabled { opacity: .4; cursor: default; }
.btw-stop { border: .5px solid var(--dsw-alias-border-l4, rgba(0,0,0,.16)); background: transparent; color: var(--dsw-alias-label-secondary, #61666b); }
.btw-stop:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06)); }
`

/** Set when a shortcut asks for a draft before the panel is mounted, so the request is not lost. */
let freshPending = false

interface ChatMeta {
  childId: string
  running: boolean
  contextCount: number
  title: string
}

interface Snapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface ClientContext {
  sessions: { list: Snapshot<{ current?: string }> }
  uiSession: { adapter?: { current: Snapshot<{ key?: string }> } }
  sidebarRightTabs: { register(tab: { id: string; kind: string; title(address: string): string; guide?: Array<{ id: string; order: number; commandId?: string; title(): string; description?(): string }> }): () => void }
  sidebarRight: { openTab(kind: string): void }
  slots: {
    inject(name: string, fn: () => () => void): void
    register(definition: { name: string; key?: string }, body: ComponentType<Record<string, never>>): () => void
  }
  locale: {
    register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
    bind(namespace: string): (key: string) => string
  }
  commandUi: { register(command: { name: string; label(): string; description?(): string; ui: { kind: 'action'; run(session: { sessionId: string }): void } }): () => void }
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

const current = (ctx: ClientContext): string | undefined =>
  ctx.uiSession.adapter?.current.getSnapshot().key ?? ctx.sessions.list.getSnapshot().current

const call = async (path: string, body?: unknown): Promise<Record<string, unknown>> => {
  const response = await fetch(`/btw/api/${path}`, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const value = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : response.statusText)
  return value
}

/** The side chats the host reports for one conversation, oldest first. */
const metas = (value: Record<string, unknown>): ChatMeta[] =>
  Array.isArray(value.chats)
    ? (value.chats as Array<Record<string, unknown>>).flatMap((item) => typeof item.childId === 'string'
        ? [{
            childId: item.childId,
            running: item.running === true,
            contextCount: typeof item.contextCount === 'number' ? item.contextCount : 0,
            title: typeof item.title === 'string' ? item.title : '',
          }]
        : [])
    : []

export function Panel({ client, t }: { client: ClientContext; t: Translate }) {
  const [parent, setParent] = useState<string>()
  const [chats, setChats] = useState<ChatMeta[]>([])
  const [child, setChild] = useState<string>()
  const [contextCount, setContextCount] = useState(0)
  const [messages, setMessages] = useState<Line[]>([])
  const [queued, setQueued] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const composing = useRef(false)
  const sending = useRef(false)
  const input = useRef<HTMLTextAreaElement | null>(null)
  const flow = useRef<HTMLDivElement | null>(null)
  const loaded = useRef<string>()

  useEffect(() => {
    if (document.querySelector('style[data-btw]') === null) {
      const style = document.createElement('style')
      style.dataset.btw = ''
      style.textContent = CSS
      document.head.append(style)
    }
    input.current?.focus()
    const focus = () => { input.current?.focus() }
    window.addEventListener(FOCUS, focus)
    return () => { window.removeEventListener(FOCUS, focus) }
  }, [])

  const reset = (): void => {
    setChild(undefined)
    setContextCount(0)
    setMessages([])
    setQueued([])
    setRunning(false)
    setError(undefined)
  }

  const fresh = (): void => {
    reset()
    input.current?.focus()
  }

  useEffect(() => {
    const request = () => { freshPending = false; fresh() }
    if (freshPending) request()
    window.addEventListener(NEW, request)
    return () => { window.removeEventListener(NEW, request) }
  }, [])

  useEffect(() => {
    const sync = () => {
      const id = current(client)
      setParent(id)
      if (id === undefined) {
        loaded.current = undefined
        reset()
        setChats([])
        return
      }
      if (id === loaded.current) return
      loaded.current = id
      reset()
      setChats([])
      void call(`state?parentSessionId=${encodeURIComponent(id)}`).then((value) => {
        if (loaded.current !== id) return
        const list = metas(value)
        setChats(list)
        const latest = list[list.length - 1]
        if (latest === undefined) return
        setChild(latest.childId)
        setContextCount(latest.contextCount)
        setRunning(latest.running)
      }).catch(() => {})
    }
    sync()
    const offs = [client.sessions.list.subscribe(sync), client.uiSession.adapter?.current.subscribe(sync)]
    return () => { for (const off of offs) off?.() }
  }, [client])

  useEffect(() => {
    if (parent === undefined) return
    let live = true
    const tick = async () => {
      try {
        const value = await call(`state?parentSessionId=${encodeURIComponent(parent)}`)
        if (live) setChats(metas(value))
      } catch {
        // The host is restarting; the next state read reattaches.
      }
    }
    const timer = window.setInterval(tick, 1200)
    return () => { live = false; window.clearInterval(timer) }
  }, [parent])

  useEffect(() => {
    if (child === undefined) {
      setMessages([])
      setRunning(false)
      return
    }
    let live = true
    const tick = async () => {
      try {
        const value = await call(`history?childId=${encodeURIComponent(child)}`)
        if (!live) return
        if (Array.isArray(value.messages)) setMessages(value.messages as Line[])
        if (Array.isArray(value.queued)) setQueued(value.queued.filter((item): item is string => typeof item === 'string'))
        if (typeof value.running === 'boolean') setRunning(value.running)
      } catch {
        // The host restarted or dropped the chat; the next state read reattaches.
      }
    }
    void tick()
    const timer = window.setInterval(tick, 700)
    return () => { live = false; window.clearInterval(timer) }
  }, [child])

  useEffect(() => {
    const element = flow.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [messages, running])

  useEffect(() => {
    const element = input.current
    if (element === null) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [draft])

  const select = (id: string): void => {
    if (id === child) return
    setChild(id)
    setContextCount(chats.find((chat) => chat.childId === id)?.contextCount ?? 0)
    setMessages([])
    setQueued([])
    setRunning(false)
    setError(undefined)
    input.current?.focus()
  }

  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (text === '' || parent === undefined || sending.current) return
    sending.current = true
    setDraft('')
    setError(undefined)
    try {
      if (child === undefined) {
        const value = await call('start', { parentSessionId: parent, text })
        if (typeof value.childId !== 'string') throw new Error(t('error.create'))
        setChild(value.childId)
        setContextCount(typeof value.contextCount === 'number' ? value.contextCount : 0)
        void call(`state?parentSessionId=${encodeURIComponent(parent)}`).then((state) => { setChats(metas(state)) }).catch(() => {})
      } else {
        await call('send', { childId: child, text })
      }
      setRunning(true)
      input.current?.focus()
    } catch (cause) {
      setDraft(text)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      sending.current = false
    }
  }

  const stop = (): void => {
    if (child !== undefined) void call('stop', { childId: child }).catch(() => {})
  }

  const close = async (): Promise<void> => {
    if (child === undefined) return
    try {
      await call('close', { childId: child })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    const remaining = chats.filter((chat) => chat.childId !== child)
    setChats(remaining)
    const last = remaining[remaining.length - 1]
    if (last === undefined) fresh()
    else select(last.childId)
  }

  const markdownLabels = {
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') },
    footnotes: t('markdown.footnotes'),
  }

  return (
    <div className="btw">
      <div className="btw-bar">
        <div className="btw-chats">
          {chats.map((chat) => (
            <button
              key={chat.childId}
              type="button"
              className="btw-chip"
              data-active={chat.childId === child || undefined}
              title={chat.title === '' ? t('panel.untitled') : chat.title}
              onClick={() => { select(chat.childId) }}
            >
              {chat.running && <span className="btw-dot" />}
              <span className="btw-chip-label">{chat.title === '' ? t('panel.untitled') : chat.title}</span>
            </button>
          ))}
        </div>
        {child !== undefined && (
          <button type="button" className="btw-close" title={t('panel.close')} aria-label={t('panel.close')} onClick={() => { void close() }}>×</button>
        )}
        <button type="button" className="btw-new" data-active={child === undefined || undefined} title={t('panel.new')} aria-label={t('panel.new')} onClick={fresh}>+</button>
      </div>
      <div className="btw-flow" ref={flow}>
        {contextCount > 0 && <p className="btw-context">{t('panel.context').replace('{count}', String(contextCount))}</p>}
        {messages.length === 0
          ? <p className="btw-empty">{t('panel.empty')}</p>
          : messages.map((message, index) => (
              message.role === 'assistant'
                ? <div key={index} className="btw-msg btw-assistant"><MarkdownText text={message.text} labels={markdownLabels} /></div>
                : <div key={index} className="btw-msg btw-user">{message.text}</div>
            ))}
        {queued.length > 0 && <div className="btw-queue-label">{t('panel.queued')}</div>}
        {queued.map((text, index) => (
          <div key={`queued-${index}`} className="btw-msg btw-user btw-queued">{text}</div>
        ))}
        {running && <div className="btw-running">{t('panel.thinking')}</div>}
        {error !== undefined && <div className="btw-error">{error}</div>}
      </div>
      <div className="btw-compose">
        <textarea
          ref={input}
          className="btw-input"
          placeholder={t('panel.placeholder')}
          value={draft}
          onChange={(event) => { setDraft(event.target.value) }}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={() => { window.setTimeout(() => { composing.current = false }, 0) }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        {running
          ? <button className="btw-stop" type="button" onClick={stop}>{t('panel.stop')}</button>
          : <button className="btw-send" type="button" disabled={draft.trim() === ''} onClick={() => { void send() }}>{t('panel.send')}</button>}
      </div>
    </div>
  )
}

export const inject = ['sessions', 'uiSession', 'sidebarRightTabs', 'sidebarRight', 'slots', 'commandUi', 'shortcuts', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('btw', { zh, en }), 'btw: dictionaries')
  const t = ctx.locale.bind('btw') as Translate

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB,
    kind: TAB,
    title: () => t('tab.title'),
    guide: [{ id: TAB, order: 10, commandId: 'btw.open', title: () => t('tab.title'), description: () => t('guide.description') }],
  }), 'btw: tab type')

  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB },
    () => <Panel client={ctx} t={t} />,
  ))

  const open = (): boolean => {
    if (current(ctx) === undefined) return false
    try {
      ctx.sidebarRight.openTab(TAB)
      window.dispatchEvent(new Event(FOCUS))
      return true
    } catch {
      return false
    }
  }

  /** Open the panel and blank the composer, so the next message starts another side chat. */
  const openFresh = (): boolean => {
    if (!open()) return false
    freshPending = true
    window.dispatchEvent(new Event(NEW))
    return true
  }

  ctx.inject(['commandUi'], (scope) => {
    scope.effect(() => scope.commandUi.register({
      name: 'side',
      label: () => t('command.side'),
      description: () => t('command.description'),
      ui: { kind: 'action', run: () => { open() } },
    }), 'btw: /side')
    scope.effect(() => scope.commandUi.register({
      name: 'btw',
      label: () => t('command.btw'),
      description: () => t('command.description'),
      ui: { kind: 'action', run: () => { open() } },
    }), 'btw: /btw')
  })

  const binding = { code: 'KeyS', modifiers: ['primary', 'alt'] as const }
  const newBinding = { code: 'KeyN', modifiers: ['primary', 'alt'] as const }
  ctx.inject(['shortcuts'], (scope) => {
    scope.effect(() => scope.shortcuts.register({
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
      resolve: () => current(ctx) === undefined
        ? { status: 'blocked', reason: t('error.noSession') }
        : { status: 'handled', run: () => { open() } },
    }), 'btw: shortcut')
    scope.effect(() => scope.shortcuts.register({
      id: 'btw.new',
      label: () => t('shortcut.new'),
      aliases: ['new side chat'],
      defaults: {
        'desktop:macos': newBinding,
        'desktop:windows': newBinding,
        'desktop:linux': newBinding,
        'web:macos': newBinding,
        'web:windows': newBinding,
      },
      regions: ['page', 'editable'],
      modals: [],
      resolve: () => current(ctx) === undefined
        ? { status: 'blocked', reason: t('error.noSession') }
        : { status: 'handled', run: () => { openFresh() } },
    }), 'btw: new shortcut')
  })
}
