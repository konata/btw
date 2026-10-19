import type { IncomingMessage, ServerResponse } from 'node:http'

/** The session fields btw reads: workspace metadata and the folded request route. */
export interface Session {
  header: { cwd?: string }
  append(type: string, data: Record<string, unknown>): unknown
  requestHeader(): { config?: { provider?: string; model?: string; reasoningEffort?: string } } | undefined
}

export interface Agent {
  session: Session
  ctx: Context
  options?: { provider?: string; model?: string; reasoningEffort?: string }
  followup(input: { id: string; role: 'user'; content: Array<{ type: 'text'; text: string }>; source: { kind: string } }): unknown
  cancel(cause: { kind: string }): void
  whenIdle(): Promise<void>
}

export interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}

export interface CreateAgent {
  sessionId: string
  meta: { cwd?: string; parentSession?: string }
  agentOptions?: { provider: string; model: string; reasoningEffort?: string }
  setup(agentCtx: Context): void
}

export interface ResumeAgent {
  resumeSessionId: string
  agentOptions?: { provider: string; model: string; reasoningEffort?: string }
  setup(agentCtx: Context): void
}

export interface SessionEvent {
  type: string
  data: Record<string, unknown>
}

export interface Context {
  webServer: {
    register(route: {
      kind: 'exact' | 'prefix'
      path: string
      handler(request: IncomingMessage, response: ServerResponse): void | Promise<void>
    }): () => void
  }
  agents: {
    get(id: string): Agent | undefined
    create(options: CreateAgent): Promise<AgentHandle>
    resume(options: ResumeAgent): Promise<AgentHandle>
  }
  sessionQuery: {
    readSession(id: string): Promise<{ events: SessionEvent[] }>
    filterSessions(filters: Array<{ kind: 'parent'; values: string[] }>): Promise<Array<{ header: { id: string; createdAt: number } }>>
  }
  workspaceRegistry: {
    archiveSession(id: string, options?: { stopActivity?: boolean }): Promise<void>
    unarchiveSession(id: string): Promise<void>
    list(): Array<{
      sessionIds: string[]
      attachSession(id: string): Promise<void>
    }>
  }
  permissionPresets: {
    current(session: Session): string
    set(session: Session, preset: string): void
  }
  agentPresets: {
    composeFrom(target: Context, source: Context): void
  }
  agentDefaultModel?: {
    currentSelection(): { provider: string; model: string; reasoningEffort?: string }
  }
  systemPrompt: {
    section(input: { name: string; order: number; text: string; interpolate?: boolean }): void
  }
  effect(fn: () => void | (() => void), label?: string): void
  tools?: { register(definition: Record<string, unknown>): () => void }
  on(name: string, listener: (...args: any[]) => any, options?: { prepend?: boolean }): () => void
}
