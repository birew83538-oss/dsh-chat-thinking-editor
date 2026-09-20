<div align="center">

# dsh-chat-thinking-editor

**Tired of AI answers that never quite match what you asked for?**
**Now you decide exactly what the AI outputs.**

A plugin for [DeepSeek Harness (DSH)](<https://github.com/deepseek-ai/deepseek-harness>) that lets you **edit any assistant message's reply text AND its reasoning / thinking chain** right inside the conversation.

Keep the AI's cleverness, fix what you don't like — make the AI fully match your intent.

`DSH web plugin` · `message editing` · `thinking chain editor` · optimized for `dsh 0.1.5-rc.2+`

**English** · [中文](./README.md)

</div>

---

## ✨ What problem does it solve?

DSH agents are smart — but not every reply lands exactly the way you want. Before, your only options were:

- Re-prompt and re-run (wasting time & tokens);
- Accept a "close enough" answer;
- Copy it out, edit manually, and lose it from the agent's record.

**With this plugin you edit in place.** Reply text and thinking chain — edit any message you like. On save, the model only ever sees **your edited version**, so every follow-up builds on content you actually like.

> 🎯 In one line: **Keep the AI's cleverness, fix what you dislike, make the output fully yours.**

---

## 🚀 Highlights

- **✏️ One-click edit**: every assistant message gets a pencil in its action strip;
- **🧠 Twin editors**: each row expands into *Reply text* and *Thinking chain* fields, edited independently;
- **🗒️ Every reply covered**: the list shows **all** finalized assistant messages in the session (including intermediate replies between tool calls);
- **♻️ Surface replacement**: saving appends a `surface replacement` event — **the model only sees the edited version**; old copies are shadowed out, and a message can be edited repeatedly;
- **🔧 Smart preservation**: images, tool calls and other non-text blocks are kept untouched; empty text blanks the reply, empty thinking removes the block (and a non-empty thinking is inserted at the front when absent);
- **🔒 Run-safe**: editing is disabled while the agent is running to avoid conflicts.

---

## 📦 Installation

Prereq: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh` CLI, `0.1.5-rc.2` or newer recommended).

### Option A: local path (Recommended — tracks the repo source)

```bash
git clone https://github.com/birew83538-oss/dsh-chat-thinking-editor.git
dsh plugin --profile web add /path/to/dsh-chat-thinking-editor
```

### Option B: npm (once published)

```bash
dsh plugin --profile web add dsh-chat-thinking-editor
```

### Option C: manual bundle mount

Merge the row from [cordis.patch.yml](./cordis.patch.yml) into your profile's `dsh.profile.bundles` layer and restart `dsh web`.

> After install, restart / refresh the DSH Web page to see the pencil.

---

## 🧭 Usage

1. Run a conversation in DSH Web;
2. Hover a reply you're **not happy with** and click the pencil;
3. In the *Edit assistant messages* list, expand the target row;
4. Edit **Reply text** and/or **Thinking chain** (leave blank = remove that part);
5. Hit **Save** — the agent now continues from your new version;
6. Want to fine-tune again? Edit the same message anytime.

> 💡 To close the dialog, use the **top-left** close button (mask clicks and Esc won't dismiss it).

---

## 🐛 Little fix included

Since v0.1.1, an annoying bug is fixed: **select-all (Ctrl/Cmd+A) → delete in one editor used to wipe the sibling editor too.**

- Root cause: text selection bled across the modal layer and the two adjacent `Reply` / `Thinking` fields, so select-all grabbed page-wide text and deleting cleared both;
- Fix: intercept `Ctrl/Cmd+A` to select only the focused field, plus `user-select` isolation on the modal — now select-all only affects the field you're editing.

---

## 🛠️ Compatibility

- **Target**: DeepSeek Harness `0.1.5-rc.2+` (dependency range `^0.1.1-rc.2`, covering `0.1.1-rc.2` → `0.1.5-rc.2` and later rc/stable releases);
- **Runtime**: Node 22.19+ / 24+, pnpm 11;
- **Semantics**: built on the official `surface replacement` event (the same mechanism compaction uses) and the `conversation.chat.assistant-actions` slot — no private APIs.

> ⚠️ DSH is officially a **developer preview**; APIs may change. If you hit a compat issue after an upgrade, please open an issue.

---

## 🗂️ Layout

```
dsh-chat-thinking-editor/
├── src/                 # TypeScript source
│   ├── index.ts         # Host side: assistantEdit/replace remote service
│   └── client/          # Browser side: pencil button + edit modal + i18n
├── lib/                 # Compiled output (npm entry)
├── cordis.patch.yml     # DSH bundle mount declaration
├── package.json
└── README.md
```

---

## 🧬 Tech notes (for developers)

- **Host**: the `assistantEdit` Remote namespace exposing `replace(request)` — appends a **surface-replacement event** to the session's append-only log; the model-visible surface (`deriveMessages` folding) shows only the edited node while older copies are shadowed;
- **Browser**: the pencil injects via the `conversation.chat.assistant-actions` slot; the list collects every finalized assistant message (reply + thinking) from the conversation snapshot and saves each row independently.

---

## 📄 License

[MIT](./LICENSE)

<div align="center">
Made with ❤️ for the DeepSeek Harness community.<br/>
Tune your agent to be exactly what you want — right here in the `dsh-plugin` corner.
</div>