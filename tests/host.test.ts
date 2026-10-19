import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'
import type { Context } from '../src/types.ts'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'btw-host-'))

interface Record_ {
  id: string
  createdAt: number
  events: Array<{ type: string; data: Record<string, unknown> }>
}

const userEvent = (text: string) => ({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })

/** A host with one live main conversation and whatever side chats the disk already holds. */
const boot = (onDisk: Record_[] = []) => {
  const created: string[] = []
  const cancelled: string[] = []
  const disposed: string[] = []
  let finish: () => void = () => {}
  const idle = new Promise<void>((resolve) => { finish = resolve })
  let handler: ((request: unknown, response: unknown) => Promise<void>) | undefined

  const ctx = {
    webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {} } },
    agents: {
      get: (id: string) => id === 'parent-1'
        ? { session: { header: {}, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) }, ctx: {}, followup: () => {}, cancel: () => {} }
        : undefined,
      create: async (options: { sessionId: string }) => {
        created.push(options.sessionId)
        return {
          agent: {
            session: { header: {}, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) },
            ctx: {},
            followup: () => {},
            cancel: () => { cancelled.push('agent') },
            whenIdle: () => idle,
          },
          dispose: async () => { disposed.push(options.sessionId) },
        }
      },
      resume: async () => { throw new Error('no resume in this test') },
    },
    sessionQuery: {
      readSession: async (id: string) => ({ events: onDisk.find((record) => record.id === id)?.events ?? [] }),
      filterSessions: async () => onDisk.map((record) => ({ header: { id: record.id, createdAt: record.createdAt } })),
    },
    workspaceRegistry: { archiveSession: async () => {}, unarchiveSession: async () => {} },
    permissionPresets: { current: () => 'custom', set: () => {} },
    agentPresets: { composeFrom: () => {} },
    effect: (fn: () => void | (() => void)) => { fn() },
  } as unknown as Context

  apply(ctx)
  const route = handler
  if (route === undefined) throw new Error('btw did not register its routes')

  const call = async (method: string, path: string, body?: unknown, remote = '127.0.0.1') => {
    const payload = body === undefined ? '' : JSON.stringify(body)
    const request = {
      method,
      url: `/btw/api${path}`,
      socket: { remoteAddress: remote },
      async *[Symbol.asyncIterator]() { if (payload !== '') yield Buffer.from(payload) },
    }
    let status = 0
    let value: unknown
    const response = { writeHead: (code: number) => { status = code }, end: (raw: string) => { value = JSON.parse(raw) } }
    await route(request, response)
    return { status, value: value as Record<string, unknown> }
  }

  return { call, created, cancelled, disposed, finish }
}

describe('btw host', () => {
  it('creates a blank side chat that the client then fills', async () => {
    const { call, created } = boot()
    const first = await call('POST', '/start', { parentSessionId: 'parent-1' })
    const second = await call('POST', '/start', { parentSessionId: 'parent-1' })

    expect(first.value.childId).not.toBe(second.value.childId)
    expect(created).toEqual([first.value.childId, second.value.childId])
    expect(first.value.title).toBe('')

    const state = await call('GET', '/state?parentSessionId=parent-1')
    expect(state.value.chats).toEqual([
      { childId: first.value.childId, running: false, contextCount: 0, title: '' },
      { childId: second.value.childId, running: false, contextCount: 0, title: '' },
    ])
  })

  it('closes a side chat and keeps it out of the list', async () => {
    const { call, disposed } = boot()
    const first = await call('POST', '/start', { parentSessionId: 'parent-1', text: 'first' })

    expect((await call('POST', '/close', { childId: first.value.childId })).status).toBe(200)
    expect(disposed).toEqual([first.value.childId])
    expect((await call('GET', '/state?parentSessionId=parent-1')).value).toEqual({ chats: [] })
  })

  it('revives every side chat left on disk for a conversation', async () => {
    const { call } = boot([
      { id: 'btw-old', createdAt: 2, events: [userEvent('older question')] },
      { id: 'btw-new', createdAt: 5, events: [userEvent('newer question')] },
      { id: 'btw-other', createdAt: 9, events: [userEvent('someone else')] },
    ])
    const state = await call('GET', '/state?parentSessionId=parent-1')
    expect(state.value.chats).toEqual([
      { childId: 'btw-old', running: false, contextCount: 0, title: 'older question' },
      { childId: 'btw-new', running: false, contextCount: 0, title: 'newer question' },
      { childId: 'btw-other', running: false, contextCount: 0, title: 'someone else' },
    ])
  })

  it('answers with no chats when the shell has no conversation open', async () => {
    const { call } = boot()
    expect((await call('GET', '/state?parentSessionId=')).value).toEqual({ chats: [] })
  })

  it('rejects anything not from loopback', async () => {
    const { call, created } = boot()
    const rejected = await call('POST', '/start', { parentSessionId: 'parent-1', text: 'hi' }, '10.0.0.9')
    expect(rejected.status).toBe(403)
    expect(created).toEqual([])
  })
})
