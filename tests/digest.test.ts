import { describe, expect, it } from 'vitest'
import { digest, display, fold } from '../src/digest.ts'
import type { SessionEvent } from '../src/types.ts'

const user = (text: string, kind = 'user'): SessionEvent => ({
  type: 'user/message',
  data: { content: [{ type: 'text', text }], source: { kind } },
})

const assistant = (text: string): SessionEvent => ({
  type: 'assistant/message',
  data: { message: { content: [{ type: 'text', text }] } },
})

describe('fold', () => {
  it('keeps user and assistant prose and skips injected context', () => {
    expect(fold([user('hello'), user('runtime context', 'plugin'), assistant('here'), { type: 'tool/result', data: {} }]))
      .toEqual([{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'here' }])
  })

  it('joins multiple text blocks and drops empty messages', () => {
    expect(fold([
      { type: 'user/message', data: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], source: { kind: 'user' } } },
      { type: 'user/message', data: { content: [{ type: 'text', text: '  ' }], source: { kind: 'user' } } },
    ])).toEqual([{ role: 'user', text: 'a\nb' }])
  })
})

describe('digest', () => {
  const line = (index: number): { role: 'user'; text: string } => ({ role: 'user', text: `message ${index}` })

  it('keeps the newest messages when the budget is tight', () => {
    const result = digest(Array.from({ length: 10 }, (_, index) => line(index)), 10, 20)
    expect(result.count).toBeLessThan(10)
    expect(result.text).toContain('message 9')
    expect(result.text).not.toContain('message 0')
  })

  it('returns empty for no history', () => {
    expect(digest([])).toEqual({ text: '', count: 0 })
  })
})

describe('display', () => {
  it('turns each tool call into a visible progress line', () => {
    expect(display([
      user('hi'),
      { type: 'tool/call', data: { name: 'bash', arguments: '{"command":"ls"}' } },
      assistant('done'),
    ])).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: '→ bash {"command":"ls"}' },
      { role: 'assistant', text: 'done' },
    ])
  })
})
