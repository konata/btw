import { describe, expect, it } from 'vitest'
import { apply, type ClientContext } from '../src/client/index.tsx'
import { en } from '../src/client/locales.ts'

describe('client registration', () => {
  it('contributes an array-shaped guide entry, both commands, and the shortcut', () => {
    const tabs: Array<Record<string, unknown>> = []
    const commands: Array<Record<string, unknown>> = []
    const shortcuts: Array<Record<string, unknown>> = []
    const slots: Array<Record<string, unknown>> = []

    const ctx = {
      sessions: { list: { getSnapshot: () => ({ current: 'session-1' }), subscribe: () => () => {} } },
      uiSession: { adapter: { current: { getSnapshot: () => ({ key: 'session-1' }), subscribe: () => () => {} } } },
      locale: {
        register: () => () => {},
        bind: () => (key: string) => (en as Record<string, string>)[key] ?? key,
      },
      sidebarRightTabs: { register: (tab: Record<string, unknown>) => { tabs.push(tab); return () => {} } },
      sidebarRight: { openTab: () => {} },
      slots: {
        inject: (_name: string, fn: () => void) => { fn() },
        register: (definition: Record<string, unknown>) => { slots.push(definition); return () => {} },
      },
      commandUi: { register: (command: Record<string, unknown>) => { commands.push(command); return () => {} } },
      shortcuts: { register: (command: Record<string, unknown>) => { shortcuts.push(command); return () => {} } },
      inject: (_deps: string[], fn: (scope: unknown) => void) => { fn(ctx) },
      effect: (fn: () => void | (() => void)) => { fn() },
    } as unknown as ClientContext

    apply(ctx)

    expect(Array.isArray(tabs[0]?.guide)).toBe(true)
    expect((tabs[0]?.guide as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: 'btw',
      order: 10,
      commandId: 'btw.open',
    })
    expect(commands.map((command) => command.name)).toEqual(['side', 'btw'])
    expect(shortcuts.map((shortcut) => shortcut.id)).toEqual(['btw.open', 'btw.new'])
    expect(slots[0]).toEqual({ name: 'sidebar.right.pane.tab', key: 'btw' })
  })
})
