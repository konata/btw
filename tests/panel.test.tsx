import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Panel } from '../src/client/index.tsx'
import { en, type Key } from '../src/client/locales.ts'

const t = (key: Key): string => en[key]

const store = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} })

const client = {
  sessions: { list: store<{ current?: string }>({ current: 'parent-1' }) },
  uiSession: { adapter: { current: store<{ key?: string }>({ key: 'parent-1' }) } },
} as never

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

interface Routes {
  state?: unknown
  start?: unknown
  history?: Record<string, { messages?: unknown[]; running?: boolean; queued?: string[] }>
}

let routes: Routes
let posts: Array<{ path: string; body: Record<string, unknown> }>
let queries: Array<{ path: string; childId?: string }>

beforeEach(() => {
  routes = {}
  posts = []
  queries = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://btw.local')
    const path = url.pathname.slice('/btw/api/'.length)
    const childId = url.searchParams.get('childId') ?? undefined
    queries.push({ path, childId })
    if (init?.body !== undefined) posts.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> })
    if (path === 'state') return json(routes.state ?? {})
    if (path === 'history') return json(routes.history?.[childId ?? ''] ?? { messages: [], running: false })
    if (path === 'start') return json(routes.start ?? {})
    return json({ ok: true })
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('btw panel', () => {
  it('reattaches the newest side chat and shows its context count', async () => {
    routes = {
      state: { chats: [{ childId: 'child-1', contextCount: 2, running: false, title: 'hello' }] },
      history: { 'child-1': { messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'here' }] } },
    }
    render(<Panel client={client} t={t} />)
    expect(await screen.findByText('here')).toBeTruthy()
    expect(screen.getByText('Main thread · 2 messages')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'hello' })).toBeTruthy()
  })

  it('shows a message queued behind the running turn', async () => {
    routes = {
      state: { chats: [{ childId: 'child-1', contextCount: 0, running: true, title: 'hello' }] },
      history: { 'child-1': { messages: [{ role: 'user', text: 'hello' }], running: true, queued: ['later'] } },
    }
    render(<Panel client={client} t={t} />)
    expect(await screen.findByText('later')).toBeTruthy()
    expect(screen.getByText('Queued')).toBeTruthy()
  })

  it('lists every side chat of the conversation and switches between them', async () => {
    routes = {
      state: {
        chats: [
          { childId: 'child-a', contextCount: 1, running: false, title: 'alpha' },
          { childId: 'child-b', contextCount: 3, running: false, title: 'beta' },
        ],
      },
      history: {
        'child-a': { messages: [{ role: 'assistant', text: 'from alpha' }] },
        'child-b': { messages: [{ role: 'assistant', text: 'from beta' }] },
      },
    }
    render(<Panel client={client} t={t} />)
    expect(await screen.findByText('from beta')).toBeTruthy()

    fireEvent.click(screen.getByText('alpha'))
    expect(await screen.findByText('from alpha')).toBeTruthy()
    expect(queries.some((query) => query.path === 'history' && query.childId === 'child-a')).toBe(true)
  })

  it('closes the active side chat and falls back to the previous one', async () => {
    routes = {
      state: {
        chats: [
          { childId: 'child-a', contextCount: 0, running: false, title: 'alpha' },
          { childId: 'child-b', contextCount: 0, running: false, title: 'beta' },
        ],
      },
      history: {
        'child-a': { messages: [{ role: 'assistant', text: 'from alpha' }] },
        'child-b': { messages: [{ role: 'assistant', text: 'from beta' }] },
      },
    }
    render(<Panel client={client} t={t} />)
    expect(await screen.findByText('from beta')).toBeTruthy()

    routes.state = { chats: [{ childId: 'child-a', contextCount: 0, running: false, title: 'alpha' }] }
    fireEvent.click(screen.getByLabelText(en['panel.close']))
    await waitFor(() => expect(posts.some((post) => post.path === 'close' && post.body.childId === 'child-b')).toBe(true))
    expect(await screen.findByText('from alpha')).toBeTruthy()
    expect(screen.queryByText('beta')).toBeNull()
  })

  it('opens a draft from + and starts another side chat', async () => {
    routes = {
      state: { chats: [{ childId: 'child-a', contextCount: 0, running: false, title: 'alpha' }] },
      history: { 'child-a': { messages: [{ role: 'assistant', text: 'from alpha' }] } },
      start: { childId: 'child-b', contextCount: 0, title: 'second' },
    }
    render(<Panel client={client} t={t} />)
    expect(await screen.findByText('from alpha')).toBeTruthy()

    fireEvent.click(screen.getByLabelText(en['panel.new']))
    await waitFor(() => expect(screen.queryByText('from alpha')).toBeNull())

    const input = screen.getByPlaceholderText(en['panel.placeholder'])
    fireEvent.change(input, { target: { value: 'second' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })

    await waitFor(() => expect(posts.some((post) => post.path === 'start')).toBe(true))
    expect(posts.find((post) => post.path === 'start')?.body).toEqual({ parentSessionId: 'parent-1', text: 'second' })
    expect(posts.some((post) => post.path === 'send')).toBe(false)
  })

  it('creates the side chat on the first send and follows its history', async () => {
    routes = {
      state: {},
      start: { childId: 'child-1', contextCount: 1, title: 'hello' },
      history: { 'child-1': { messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'got it' }] } },
    }
    render(<Panel client={client} t={t} />)
    const input = await screen.findByPlaceholderText(en['panel.placeholder'])
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })

    await waitFor(() => expect(posts.some((post) => post.path === 'start')).toBe(true))
    expect(posts.find((post) => post.path === 'start')?.body).toEqual({ parentSessionId: 'parent-1', text: 'hello' })
    expect(await screen.findByText('got it')).toBeTruthy()
  })

  it('lets the Enter that commits an IME candidate through to the IME', async () => {
    routes = { state: {} }
    render(<Panel client={client} t={t} />)
    const input = await screen.findByPlaceholderText(en['panel.placeholder'])
    fireEvent.change(input, { target: { value: 'nihao' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 229 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(posts.some((post) => post.path === 'start')).toBe(false)

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })
    await waitFor(() => expect(posts.some((post) => post.path === 'start')).toBe(true))
  })
})
