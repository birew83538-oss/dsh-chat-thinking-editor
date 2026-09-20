<div align="center">

# dsh-chat-thinking-editor

**你还在为 AI 的回答不符合你的要求而烦恼吗？**
**现在，AI 的输出，完全可以由你说了算。**

一个专为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的插件：在对话里**直接编辑任意一条 AI 消息的正文，以及它的思维链（reasoning / thinking）**。

保留 AI 的聪明，改掉你不满意的地方 —— 让 AI 完全符合你的心意。

`DSH web 插件` · `消息编辑` · `思维链修改` · 完美适配 `dsh 0.1.5-rc.2+`

**简体中文** · [English](./README_EN.md)

</div>

---

## ✨ 它解决什么问题？

DeepSeek Harness 的 Agent 已经很聪明，但每次回答并非 100% 贴合你的期望。以往你只能：

- 重新追问、一遍遍重跑 —— 费时费 token；
- 接受一个"差一点就对了"的结果；
- 复制出去手动改 —— 改完就不算 Agent 的记录了。

**有了这个插件，你直接改。** 正文、思维链，想改哪条改哪条。改完保存后，模型只会看到**你修改后的版本** —— 后续联想到的对话，都建立在你满意的内容之上。

> 🎯 一句话：**保留 AI 的聪明，改掉你不满意的地方，让 AI 完全符合你的心意。**

---

## 🚀 功能亮点

- **✏️ 一键编辑**：每一条 AI 消息的右上操作条都多了个铅笔按钮；
- **🧠 正文 + 思维链双编辑**：弹出编辑列表，每条可展开为「回复内容」和「思考链」两个输入框，分别独立编辑；
- **🗒️ 覆盖全部回复**：列出当前会话里**每一条**已完成的 AI 回复（包括工具调用之间的中间回复），不只当前那条；
- **♻️ 表面替换机制**：保存会追加一个 `surface replacement` 事件 —— **模型只看到你编辑后的版本**，原版与旧版都会被移出模型视野，且同一条可反复编辑；
- **🔧 智能保留**：图片、工具调用等非文本块原样保留；文本留空＝清空回复，思维链留空＝删除思维块（原本没有思维时，填入即插入到内容前面）；
- **🔒 运行态保护**：Agent 正在运行时会禁用编辑，避免并发冲突。

---

## 📦 安装

依赖：已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh` CLI，推荐 `0.1.5-rc.2` 及以上）。

### 方式一：本地路径（推荐，源码随仓库）

```bash
# 把仓库 clone 到本地后
dsh plugin --profile web add /path/to/dsh-chat-thinking-editor
```

### 方式二：npm（发布后可用）

```bash
dsh plugin --profile web add dsh-chat-thinking-editor
```

### 方式三：手动挂载（bundle patch）

将 [cordis.patch.yml](./cordis.patch.yml) 里对应条目合并进 profile 的 `dsh.profile.bundles` 层即可，`dsh web` 启动后自动装载。

> 装完重启/刷新 DSH Web 页面即可看到铅笔按钮。

---

## 🧭 使用流程

1. 在 DSH Web 里跑完一段对话；
2. 鼠标移到某个你**不满意的 AI 回复**上，点击铅笔图标；
3. 在弹出的「编辑助手消息」列表中，点击目标条目展开；
4. 修改 **回复内容** 或 **思考链**（可仅改其中一个）；为空表示删除该部分；
5. 点击 **保存** —— Agent 后续只会基于你的新版本继续思考；
6. 想微调？同一消息可反复编辑，随时再点铅笔。

> 💡 关闭弹窗：点击**左上角**的关闭按钮（为避免移动端误触，遮罩点击 / Esc 不会关闭）。

---

## 🐛 更体贴的小修复

v0.1.1 起修复了一个恼人的小问题：**对其中一个编辑框「全选（Ctrl/Cmd+A）→ 删除」，之前会连另一个编辑框的内容一起清空**。

- 根因：选区在弹窗层、"正文/思维链"两个相邻输入框间互相串扰，全选删到了整段页面文本；
- 修复：拦截 `Ctrl/Cmd+A` 仅作用于当前输入框，并给弹窗加 `user-select` 隔离 —— 现在全选只影响你正在编辑的那一栏。

---

## 🛠️ 兼容性

- **目标版本**：DeepSeek Harness `0.1.5-rc.2+`（依赖区间 `^0.1.1-rc.2`，覆盖 `0.1.1-rc.2` 至 `0.1.5-rc.2` 及各后续 rc/稳定版）；
- **运行环境**：Node.js 22.19+ / 24+，pnpm 11；
- **行为语义**：基于官方 `surface replacement` 事件（同 compaction 机制）与 `conversation.chat.assistant-actions` 槽位注入，非私有 API。

> ⚠️ DSH 官方明确标注为 **developer preview**，接口可能随版本演进。若升级 DSH 后出现兼容问题，欢迎提 issue。

---

## 🗂️ 目录结构

```
dsh-chat-thinking-editor/
├── src/                 # TypeScript 源码
│   ├── index.ts         # Host 端：assistantEdit/replace 远程服务
│   └── client/          # 浏览器端：铅笔按钮 + 编辑弹窗 + 文案
├── lib/                 # 编译产物（npm 入口）
├── cordis.patch.yml     # DSH bundle 挂载声明
├── package.json
└── README.md
```

---

## 🧬 技术机制（给开发者）

- **Host 端**：`assistantEdit` Remote 命名空间，暴露 `replace(request)` —— 向会话只读日志追加 **surface-replacement 事件**，模型可见面（`deriveMessages` 折叠）只显示编辑后的节点，旧副本全部被影子化；
- **浏览器端**：通过 `conversation.chat.assistant-actions` 槽位注入铅笔按钮，编辑列表从会话快照收集每条已完成的 assistant 消息（正文 + 思维链），逐条独立保存。

---

## 📄 License

[MIT](./LICENSE)

<div align="center">
Made with ❤️ for the DeepSeek Harness community.<br/>
在 `dsh-plugin` 专区与全球 DSH 玩家一起，把 Agent 调教成你自己喜欢的样子。
</div>