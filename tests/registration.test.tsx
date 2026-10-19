import { describe, expect, it, vi } from 'vitest'
import { apply, type ClientContext } from '../src/client/index.tsx'
import { en } from '../src/client/locales.ts'

const store = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} })

const boot = () => {
  const tabs: Array<Record<string, any>> = []
  const commands: Array<Record<string, any>> = []
  const shortcuts: Array<Record<string, any>> = []
  const slots: Array<Record<string, any>> = []
  const providers: Array<Record<string, any>> = []
  const closed: string[] = []
  const opened: string[] = []
  const retained: string[] = []
  let released = false

  const ctx = {
    sessions: {
      list: store({ current: 'session-1', phase: 'ready' }),
      retain: (childId: string) => { retained.push(childId); return { ready: Promise.resolve(), release: () => { released = true } } },
      refresh: async () => {},
    },
    uiSession: { adapter: { current: store({ key: 'session-1' }) } },
    resources: { register: (provider: Record<string, any>) => { providers.push(provider); return () => {} } },
    locale: {
      register: () => () => {},
      bind: () => (key: string) => (en as Record<string, string>)[key] ?? key,
    },
    sidebarRightTabs: { register: (tab: Record<string, any>) => { tabs.push(tab); return () => {} } },
    sidebarRight: {
      openResource: (address: string) => { opened.push(address) },
      registerCloseHandler: (kind: string, handler: (sessionId: string, tab: { contentId: string }) => void) => { closed.push(kind); closeHandler = handler; return () => {} },
    },
    slots: {
      inject: (_name: string, fn: () => void) => { fn() },
      register: (definition: Record<string, any>) => { slots.push(definition); return () => {} },
    },
    commandUi: { register: (command: Record<string, any>) => { commands.push(command); return () => {} } },
    shortcuts: { register: (command: Record<string, any>) => { shortcuts.push(command); return () => {} } },
    inject: (_deps: string[], fn: (scope: unknown) => void) => { fn(ctx) },
    effect: (fn: () => void | (() => void)) => { fn() },
  } as unknown as ClientContext

  let closeHandler: ((sessionId: string, tab: { contentId: string }) => void) | undefined
  return { ctx, tabs, commands, shortcuts, slots, providers, closed, opened, retained, close: () => closeHandler, wasReleased: () => released }
}

describe('client registration', () => {
  it('registers the resource, tab type, commands, shortcut, slots, and close handler', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const app = boot()
    apply(app.ctx)

    expect(app.providers[0]?.protocol).toBe('btw')
    expect(app.tabs[0]).toMatchObject({ id: 'btw', kind: 'btw' })
    expect(app.tabs[0]?.patterns).toContain('dsh-resource://btw/session/**')
    expect(app.tabs[0]?.canOpen?.('dsh-resource://btw/session/child-1?parent=session-1')).toBe(true)
    expect(app.tabs[0]?.canOpen?.('dsh-resource://subagentchat/session/child-1')).toBe(false)
    expect(Array.isArray(app.tabs[0]?.guide)).toBe(true)
    expect(app.tabs[0]?.guide[0]).toMatchObject({ id: 'btw', commandId: 'btw.open' })

    expect(app.commands.map((command) => command.name)).toEqual(['side', 'btw'])
    for (const command of app.commands) expect(command.available()).toBe(true)
    expect(app.shortcuts.map((shortcut) => shortcut.id)).toEqual(['btw.open'])

    expect(app.slots).toContainEqual({ name: 'sidebar.right.pane.tab', key: 'btw', children: { 'btw.conversation': { kind: 'single', scope: 'session' } } })
    expect(app.slots).toContainEqual({ name: 'btw.conversation' })
    expect(app.closed).toEqual(['btw'])
    vi.unstubAllGlobals()
  })

  it('opens the chat resource through the host attach route and retains the session', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ title: 'hello' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const app = boot()
    apply(app.ctx)

    const controller = new AbortController()
    const provider = app.providers[0]
    const iterator = provider.open('dsh-resource://btw/session/child-1?parent=session-1', { signal: controller.signal })
    const first = await iterator.next()

    expect(fetchMock).toHaveBeenCalledWith('/btw/api/attach', expect.objectContaining({ method: 'POST' }))
    expect(app.retained).toEqual(['child-1'])
    expect(first.value.ok).toBe(true)
    controller.abort()
    await iterator.next()
    expect(app.wasReleased()).toBe(true)
    vi.unstubAllGlobals()
  })
})
