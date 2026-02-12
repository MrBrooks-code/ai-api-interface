# Bedrock Chat — Improvement Proposals

A comparison of Bedrock Chat against Claude Desktop and ChatGPT Desktop, with proposed improvements organized by effort and impact. This is a discussion document — nothing is committed until we agree on priorities.

---

## What We Already Have

For context, Bedrock Chat currently covers:

- Streaming chat with Bedrock Converse API
- Web search (DuckDuckGo) and webpage reading with SSRF protection
- Calculator and current-time tools
- AWS SSO with device auth flow, auto-connect, and token caching
- AWS profile-based authentication
- Conversation persistence with full-text search
- File uploads (images + documents)
- Rich markdown rendering with syntax-highlighted code blocks
- 7 built-in themes + admin custom theme
- Resizable sidebar
- System prompt customization
- Cross-platform packaging (macOS DMG, Windows NSIS)
- Admin-configurable logon banner, session timeout, and branding
- CMMC L2 compliance posture

---

## Completed Improvements

### A1. Keyboard Shortcuts — Done
Added global keyboard shortcuts matching the ChatGPT desktop shortcut set via `useGlobalShortcuts` hook. Includes new chat, toggle sidebar, copy last response, copy last code block, delete conversation, stop streaming, focus chat input, and conversation search.

### A2. Conversation Rename — Done
Double-click a conversation title in the sidebar to edit it inline. Press Enter to save, Escape to cancel.

### A3. Copy Last Response Shortcut — Done
`Cmd/Ctrl+Shift+C` copies the last assistant response. `Cmd/Ctrl+Shift+;` copies the last fenced code block.

### A4. Conversation Delete Confirmation — Done
Clicking the ✕ button or pressing `Cmd/Ctrl+Shift+Backspace` now shows a themed confirmation dialog instead of instantly deleting. Cancel or Escape dismisses; Delete confirms.

---

## Proposed Improvements

### A. Quick Wins (Small effort, high polish)

#### A5. Export Conversation
**Gap:** Both competitors let you copy/export conversations. We have no export.

**Proposal:** Add "Export as Markdown" to conversation context menu. Writes a `.md` file with all messages formatted.

---

### B. Medium Effort (Meaningful features)

#### B1. Conversation Folders / Projects
**Gap:** Both Claude (Projects) and ChatGPT (Projects) offer folder-like workspaces with per-project system prompts and file uploads. We have a flat conversation list.

**Proposal:** Add lightweight folders (no per-folder files or system prompts initially — just grouping). Conversations can be dragged into folders. Sidebar shows collapsible folder tree above the flat "Uncategorized" list.

**Stretch:** Per-folder system prompts.

---

#### B2. Conversation Archive
**Gap:** Both competitors let you archive old conversations to declutter the sidebar without deleting them.

**Proposal:** Add "Archive" option on conversations. Archived chats hidden from the main list but accessible via an "Archived" section at the bottom of the sidebar or through search.

---

#### B3. Message Edit / Regenerate
**Gap:** Both Claude and ChatGPT let you edit a previous user message and regenerate from that point. We don't.

**Proposal:** Add an "Edit" button on user messages that opens the message for editing. On submit, truncate the conversation at that point and resend. Add a "Regenerate" button on the last assistant message.

---

#### B4. Markdown / Text Export Panel — Done
Subsumed by C1 (Artifacts / Preview Panel). The preview panel supports markdown, HTML, SVG, Mermaid, CSV, and LaTeX with copy/download actions.

---

#### B5. Drag-and-Drop File Upload
**Gap:** Both competitors support drag-and-drop into the chat. We only have the file picker button.

**Proposal:** Accept file drops on the input bar or the entire chat area. Show a drop zone overlay when dragging.

---

#### B6. Dark/Light Mode Quick Toggle
**Gap:** Claude has a simple Light/Dark/System toggle. Our theme picker requires opening Settings.

**Proposal:** Add a small theme toggle icon in the sidebar footer (next to the connection status) that cycles between the user's last-used dark and light themes, or opens a compact theme picker popover.

---

#### B7. LaTeX / Math Rendering — Done
Added KaTeX-powered LaTeX preview via the Artifacts panel. Fenced `latex` / `tex` / `katex` code blocks show a "Preview" button that renders the math in a sandboxed iframe side panel.

---

### C. Larger Efforts (High impact, more work)

#### C1. Artifacts / Preview Panel — Done
Added a resizable side panel that previews six content types from fenced code blocks: HTML (live with JS), SVG (centered), Mermaid diagrams (rendered to SVG via mermaid.js with theme-aware light/dark), Markdown (rendered to styled HTML), CSV (rendered as a formatted table), and LaTeX (rendered via KaTeX). The panel slides open/closed with animation, supports drag-to-resize, copy-to-clipboard, download with correct file extension, and Escape-to-close. All content is sandboxed in an iframe with `sandbox="allow-scripts"`. The Preview button toggles the panel open and closed.

---

#### C2. Voice Input
**Gap:** Both competitors offer voice dictation. We're keyboard-only.

**Proposal:** Add a microphone button to the input bar that uses the Web Speech API (or Whisper via a local endpoint) for dictation. Transcribed text populates the input field for review before sending.

---

#### C3. Screenshot Capture
**Gap:** Both Claude and ChatGPT desktop apps can capture screenshots and attach them directly to the conversation.

**Proposal:** Add a screenshot button to the input bar. Uses Electron's `desktopCapturer` API to let the user select a screen region. The capture is attached as an image to the next message.

---

#### C4. Persistent Memory / Context
**Gap:** Both Claude and ChatGPT maintain persistent memory across conversations (user preferences, facts mentioned previously). Each of our conversations is isolated.

**Proposal:** Add a "Memory" section in Settings where users can write persistent notes (free-form text). These notes are prepended to the system prompt in every conversation. Not automatic extraction — user-controlled.

**Stretch:** Automatic memory extraction from conversations with user approval.

---

#### C5. Extended Thinking / Reasoning Mode
**Gap:** Claude has extended thinking toggle. ChatGPT has thinking-level control. We send everything as a standard Converse API call.

**Proposal:** If the connected model supports it (e.g., Claude with `thinking` parameter), add a toggle in the input bar to enable extended thinking. Display the thinking process in a collapsible block above the response.

---

#### C6. Deep Research Mode
**Gap:** Both Claude and ChatGPT offer agentic multi-step research that searches many sources and synthesizes findings. Our web search is single-shot.

**Proposal:** Add a "Research" mode toggle. When enabled, the model is given a multi-step research system prompt and tool loop: search → read → refine query → search again → synthesize. Results are presented with source citations. Reuses our existing web_search and read_webpage tools in a loop.

---

#### C7. Multiple Model Support in One Session
**Gap:** Both competitors let you switch models mid-conversation. We require a reconnection to change models.

**Proposal:** Allow model switching from a dropdown in the input bar without disconnecting. The Bedrock client already supports multiple model IDs — we just need to pass the selected model per-request rather than storing it globally.

---

### D. Stretch / Long-Term

| Idea | Inspiration | Notes |
|------|-------------|-------|
| **Scheduled tasks** | ChatGPT | Run prompts on a schedule (daily briefings, reports). Would need a background job system. |
| **MCP server support** | Claude | Open protocol for external tool integrations. Significant architectural addition. |
| **Conversation sharing** | Both | Export a conversation as a shareable link or file. Security implications for enterprise. |
| **Mobile companion** | Both | React Native or PWA companion app. Large undertaking. |
| **Multi-window** | ChatGPT companion | Open conversations in separate windows for side-by-side use. Electron supports this natively. |
| **Image generation** | ChatGPT | Bedrock supports Stability AI and Titan image models. Could add as a tool. |
| **Code execution sandbox** | Both | Run Python/JS code blocks locally in a sandboxed environment and display output. |

---

## Suggested Priority Order

Based on effort-to-impact ratio and what would make the biggest day-to-day difference:

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| ~~1~~ | ~~A1. Keyboard shortcuts~~ | ~~Small~~ | ~~Done~~ |
| ~~2~~ | ~~A2. Conversation rename~~ | ~~Small~~ | ~~Done~~ |
| ~~3~~ | ~~A3. Copy last response shortcut~~ | ~~Small~~ | ~~Done~~ |
| ~~4~~ | ~~A4. Conversation delete confirmation~~ | ~~Small~~ | ~~Done~~ |
| 5 | B5. Drag-and-drop upload | Small-Med | Medium — friction reducer |
| 6 | B3. Message edit / regenerate | Medium | High — both competitors have this |
| 7 | A5. Export conversation | Small | Medium — compliance teams want this |
| 8 | B1. Conversation folders | Medium | High — organization at scale |
| ~~9~~ | ~~B7. LaTeX rendering~~ | ~~Small-Med~~ | ~~Done~~ |
| 10 | C7. Multi-model switching | Medium | High — Bedrock's key advantage is model choice |
| ~~11~~ | ~~B4. Pop-out preview panel~~ | ~~Medium~~ | ~~Done (via C1)~~ |
| 12 | C6. Deep research mode | Medium-Large | High — differentiator |
| ~~13~~ | ~~C1. Artifacts / preview~~ | ~~Large~~ | ~~Done~~ |
| 14 | C5. Extended thinking | Medium | Medium — model-dependent |
| 15 | C3. Screenshot capture | Medium | Medium — nice to have |
| 16 | C2. Voice input | Medium | Low-Med — niche usage |
| 17 | C4. Persistent memory | Medium-Large | Medium — user-controlled version is simpler |

---

## Open Questions

1. **Who is the primary user?** Power users who want shortcuts and folders, or casual users who want simplicity?
2. **Is multi-model switching a priority?** Bedrock's unique advantage is access to Claude, Llama, Mistral, etc. in one app.
3. **Do compliance requirements constrain any of these?** e.g., voice input recording, persistent memory, export.
4. **Should we focus on parity with competitors or lean into Bedrock-specific differentiators** (multi-model, GovCloud, admin config)?
5. **What's the timeline/pace?** Ship one feature per cycle, or batch a few quick wins together?
