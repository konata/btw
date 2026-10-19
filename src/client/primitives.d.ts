declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ComponentType } from 'react'
  export const MarkdownText: ComponentType<{
    text: string
    labels?: { code?: { copyLabel?: string; copiedLabel?: string }; footnotes?: string }
  }>
}
