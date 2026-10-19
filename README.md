# btw

btw is an external plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), the desktop coding-agent app. It adds parallel side chats to the right sidebar of any DSH conversation. A side chat runs beside the main thread, inherits its workspace, tools, permissions, model, and reasoning effort, and starts with a digest of the main conversation. The side-chat tab renders the **shared conversation surface**, so composing, queuing, attachments, tool cards, Markdown, and scrolling behave exactly like the main thread.

## Requirements

- DeepSeek Harness 0.2.1-rc.1 or newer (the `engines.dsh` floor in `package.json`).
- A DSH profile to install into; the desktop profile is shown below.
- btw is not a standalone app: the host half runs inside the DSH host, and the client half is a DSH Web client plugin. It plugs into DSH's `resources`, `sessions`, `sidebarRightTabs`, `sidebarRight`, `slots`, `commandUi`, `shortcuts`, and `locale` services, and renders DSH's shared `conversation.content` factory.

## How it works

- A side chat is an ordinary hidden Session: `meta.parentSession` records lineage, and the session is archived right after creation, so it stays out of the session lists.
- The client does not paint a custom chat panel. Each side chat is a **resource tab**:
  - address: `dsh-resource://btw/session/<child>?parent=<parent>`
  - the resource provider calls `/attach` first (so the child Agent is live), refreshes the session catalog, then `sessions.retain()`
  - the tab body binds the child with `SessionProvider` and renders `conversation.content` with `variant: 'embedded'`
  - therefore the composer, image paste/attachments, queued messages, tool cards, thinking, Markdown, and scroll-follow all come from the main-thread components
- Archive and sending: the shared Composer prompts the child session directly. A **prepended** `agent/pre-step` listener unarchives the child before the archived-session gate runs; `agent/status` re-archives it once the agent is idle.
- Context is injected as system-prompt sections: at fork time the host reads the parent transcript, keeps roughly the last 10 messages / 6000 characters, and adds `btw:context` (`interpolate: false`) plus `btw:role`. Reattaching a chat re-reads the parent and refreshes the digest.
- Inheritance: `agentPresets.composeFrom(agentCtx, parent.ctx)` copies tools and prompt sections; `permissionPresets` copies the access policy; the model route comes from the parent's `request/header` (falling back to `agentDefaultModel`). The child is accounted into the parent's Workspace and seeded with a `model/selection` event so the shared composer does not ask for a workspace and shows the same model/effort.
- Many side chats per main conversation: one tab per chat; `GET /state` lists them all. A tab's `×` runs `registerCloseHandler` and closes the chat (`dispose` + tombstone), so it never comes back after a restart.
- Restart recovery: `/state` re-registers every `btw-*` child of the parent from disk (skipping tombstones). The resource calls `/state` before `/attach`; `attach` resumes the agent with `composeFrom` and the context sections, so a resumed side chat keeps the same tool surface.
- Tombstones live in `~/.dsh/btw/closed.json` (honoring `DSH_HOME`).
- Delivery between sessions uses agent tools, not HTTP:
  - `send_to_main` (side chat) sends `[side chat <childId>] ...` to the main conversation as a user message.
  - `send_to_side` (main thread) sends `[main thread] ...` to the most recent side chat, or to `childId` when given.
  Both call `followup` in-process; there is no loopback delivery route.
- The client depends only on `react`; everything else comes from cordis services (`resources`, `sessions`, `sidebarRightTabs`, `sidebarRight`, `slots`, `commandUi`, `shortcuts`, `locale`).

## Install

```sh
dsh plugin --profile desktop add /path/to/btw
```

After changing code, run `pnpm build` and restart the app. The host snapshots client bundles at boot, so reloading the page is not enough.

## Usage

UI copy comes from the DSH locale service (zh/en) and follows the app language; it is not hardcoded in the component.

- `⌘⌥S`, `/side`, or `/btw`: open the most recent side chat; create one when none exists.
- The `+` in the tab header starts another side chat.
- Closing the tab's `×` closes and deletes that side chat.
- The tab title follows the session title after the first message; before that it reads "Side chat".
- The main thread can call `send_to_side`; a side chat can call `send_to_main`.

## Limits

- The context is a snapshot taken at attach time; later messages in the main conversation are not synchronized automatically.
- DSH's session persistence layer has no delete API, so closing a side chat only disposes the agent and writes a tombstone; the `btw-*` log stays under `~/.dsh/sessions`.
- Host routes accept loopback requests only.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```
