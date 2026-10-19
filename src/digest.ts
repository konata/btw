import type { SessionEvent } from './types.ts'

export interface Line {
  role: 'user' | 'assistant'
  text: string
}

const textOf = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .filter((block): block is { type: string; text: string } =>
          block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text' &&
          typeof (block as { text?: unknown }).text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim()
    : ''

/** One log event as a conversation line, or undefined for events the panel does not show. */
function lineOf(event: SessionEvent): Line | undefined {
  if (event.type === 'user/message') {
    const source = event.data.source as { kind?: string } | undefined
    if (source !== undefined && source.kind !== 'user') return undefined
    const text = textOf(event.data.content)
    return text === '' ? undefined : { role: 'user', text }
  }
  if (event.type === 'assistant/message') {
    const text = textOf((event.data.message as { content?: unknown } | undefined)?.content)
    return text === '' ? undefined : { role: 'assistant', text }
  }
  return undefined
}

/** Fold a session log into the user/assistant prose btw carries into a side chat. */
export function fold(events: readonly SessionEvent[]): Line[] {
  return events.flatMap((event) => {
    const line = lineOf(event)
    return line === undefined ? [] : [line]
  })
}

/** Fold a side chat's log for display, including one line per tool call so a long turn stays visible. */
export function display(events: readonly SessionEvent[]): Line[] {
  const lines: Line[] = []
  for (const event of events) {
    const line = lineOf(event)
    if (line !== undefined) {
      lines.push(line)
    } else if (event.type === 'tool/call') {
      const name = typeof event.data.name === 'string' ? event.data.name : 'tool'
      const raw = event.data.arguments
      const detail = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
      lines.push({ role: 'assistant', text: `→ ${name}${detail === '' ? '' : ` ${detail.slice(0, 240)}`}` })
    }
  }
  return lines
}

export interface Digest {
  text: string
  count: number
}

/** Keep the newest messages that fit the budget, so the tail of a long thread wins. */
export function digest(lines: readonly Line[], messages = 10, characters = 6000): Digest {
  const recent = lines.slice(-messages).map(({ role, text }) => ({
    role,
    text: text.length > 1200 ? `${text.slice(0, 1200)}…` : text,
  }))
  const kept: Line[] = []
  let used = 0
  for (const line of recent.reverse()) {
    const cost = line.text.length + 4
    if (used + cost > characters && kept.length > 0) break
    kept.push(line)
    used += cost
  }
  kept.reverse()
  if (kept.length === 0) return { text: '', count: 0 }
  return {
    text: kept.map((line) => `${line.role === 'user' ? 'User' : 'Assistant'}: ${line.text}`).join('\n\n'),
    count: kept.length,
  }
}
