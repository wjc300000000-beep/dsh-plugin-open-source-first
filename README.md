# dsh-plugin-open-source-first

把「先搜索，再决策，最后才造」的**开源复用优先原则**注入 DSH 系统提示词的插件：在 persona
之后、plan/team 策略和工具引导之前，增加一段可审计的强制工序。

- 纯 host 插件，零运行时依赖，不引入 client/UI 代码；
- 通过 `ctx.systemPrompt.section({ name, order: 50, text })` 注册；
- 只在真实 agent 装配（`context.agent` 存在）时渲染，不污染非 agent 的 `assemble()` 调用；
- 自动检测 `dsh-find-plugin` 的 `find_dsh_plugin` 工具；检测到就追加「插件生态检索必须优先用它」的收紧条款。

注入的规则正文见 [`lib/index.js`](lib/index.js) 的 `RULE_TEXT`。

源码仓库：<https://github.com/wjc300000000-beep/dsh-plugin-open-source-first>

---

## 为什么是 order 50

DSH 0.2.1-rc.2 的 `@deepseek-ai/dsh-system-prompt` 内置顺序（来自实际运行时代码）：

| 常量 | order |
|---|---:|
| `HARNESS_IDENTITY`（固定开场白） | -1000 |
| `DEPLOYMENT_PERSONA_PREFIX`（persona） | 0 |
| `PLAN_POLICY` | 500 |
| `TEAM_POLICY` | 600 |
| `PTC_ONLY` | 800 |
| `FILE_REFERENCE` | 900 |
| `TOOL_BASH` … `TOOL_SUBAGENT`（工具引导） | 1000–2900 |
| `TOOLS_SDK` | 5000 |
| `HARNESS_SOURCE` / `WEB_SURFACE` / persona 后缀 | 10000 / 10100 / 10200 |

所以 order 50 落在 persona（0）之后、plan/team 策略（500/600）与全部工具引导（1000+）之前。
外部插件可以使用任意有限 order；同 order 再按 section 名字的 code-unit 顺序排列，不会互相覆盖。

> 注：社区文章里常见的「工具引导 100+」是 0.1.x 时期的布局；0.2.1-rc.2 的工具段从 1000 开始。
> order 44 或 50 都能达到「先于工具引导」的目的，本插件取 50，并可用配置改回 44。

---

## 安装（desktop profile）

桌面版使用应用自带的 CLI。普通 npm 安装的 `dsh` 命令会把 `desktop` 判为「由 Electron 应用独占管理」而拒绝，
应用自带 CLI 没有这个限制。

```sh
# 1. 在插件目录打包（或直接把目录作为 link 依赖安装）
cd dsh-plugin-open-source-first
npm pack                     # 产出 dsh-plugin-open-source-first-0.1.0.tgz

# 2. 用应用自带 CLI 安装；--profile desktop 即当前桌面配置
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add ./dsh-plugin-open-source-first-0.1.0.tgz
```

`dsh plugin add` 会做两件事：把包写进 `~/.dsh/profiles/desktop/package.json` 的依赖，并把
bundle 自动追加到 `dsh.profile.bundles`（已用本地测试包实测）。安装后**彻底退出应用（⌘Q）再重开**，
让 host 模块重新加载。

也可以直接安装目录（pnpm 会建 `link:` 依赖）：

```sh
"$DSH" plugin --profile desktop add /absolute/path/to/dsh-plugin-open-source-first
```



也可以直接从 GitHub 安装（仓库无构建步骤、无运行时依赖）：

```sh
"$DSH" plugin --profile desktop add github:wjc300000000-beep/dsh-plugin-open-source-first
```

已发布到 npm 后，安装名即可：`"$DSH" plugin --profile desktop add dsh-plugin-open-source-first`；
之后也可在 Web 侧边栏 **Plugins** 页确认 bundle 已选中。

### 确认 bundle 选择

`~/.dsh/profiles/desktop/package.json` 应出现：

```json
{
  "dependencies": { "dsh-plugin-open-source-first": "link:..." },
  "dsh": { "profile": { "bundles": [ "...", "dsh-plugin-open-source-first" ] } }
}
```

### 卸载

```sh
"$DSH" plugin --profile desktop remove dsh-plugin-open-source-first
```

然后重启应用；必要时在 Plugins 页确认 bundle 已取消选择。

---

## 配置

bundle patch 里默认已写入 `order: 50`。要覆盖配置，在
`~/.dsh/profiles/desktop/cordis.patch.yml` 追加一个按 id 定位的 patch 层：

```yaml
- id: open-source-first
  config:
    enabled: true
    order: 50
    # sectionName: 'open-source-first:rule'
    # findPluginTool: find_dsh_plugin   # 强制指定；false 关闭收紧条款
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 时不注册任何 section |
| `order` | `50` | 必须为有限数字；改动后需重载 profile |
| `sectionName` | `open-source-first:rule` | 全局唯一；与其他插件撞名时改这里 |
| `findPluginTool` | 自动检测 | 字符串：强制使用该工具名；`false`：不追加收紧条款；不填：检测 `ctx.tools.get('find_dsh_plugin', agent)` |

---

## 验证注入是否生效

### 1. 问模型

在对话框直接问：「系统提示里有没有『开源复用优先原则』这条？请复述三步流程。」
模型能复述即注入成功（软约束：注入一定发生，是否严格遵守无法 100% 保证）。

### 2. 查会话日志

DSH 会把渲染后的 system prompt 写进会话日志的 `system/message` 事件：

```sh
S=~/.dsh/sessions/--Users-ether-Documents-deepseek-harness-default-workspace--/<session-id>/session.v4.jsonl.zstd
zstdcat "$S" | grep -c "开源复用优先原则"
```

### 3. 跑真实服务集成测试

不启动应用、不调用 LLM，直接挂载真实的 `@deepseek-ai/dsh-system-prompt` 服务做装配：

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  --expose-internals scripts/verify-in-app.mjs
```

实测输出：

```text
OK  live assembly order: deployment:persona-prefix -> open-source-first:rule -> verify:plan-marker -> verify:tool-marker -> deployment:persona-suffix
OK  rule length: 1401 chars
```

### 4. 安装后的实测记录

在 desktop profile 上执行 `dsh plugin --profile desktop add ./dsh-plugin-open-source-first-0.1.0.tgz`
之后，正在运行的应用通过 HMR 立即重组了 profile，本会话的系统提示词已包含该段（未重启）：
最新 `system/message` 事件中，persona 在字符 50、规则在 111、TEAM_POLICY 在 1422，
即 `persona(0) → open-source-first(50) → team policy(600)`，顺序符合预期。
仍建议彻底重开应用一次，以排除 HMR 的边界情况。

单元测试（假 ctx，覆盖 gating、配置、自动检测、disposer）：

```sh
node --test test/index.test.mjs      # 12 passed
```

---

## 与现有开源插件的关系（先搜索过，再决定造什么）

写这个插件前，已对 npm 与 GitHub `dsh-plugin` 生态做过检索，结论：

| 项目 | 结论 |
|---|---|
| [`openharness-core-rule`](https://www.npmjs.com/package/openharness-core-rule)（npm 0.1.0） | **同款挂载写法**：`inject: ['systemPrompt']`、`order: 44`、`context.agent` gating。但它注入的是固定的「五条铁律」，正文不可配置，不能承载这条开源复用规则；本插件的挂载代码即基于它的模式特化。它的 peer 依赖面向 cordis `^4.0.1` + client runtime `0.1.0-rc.6`，在 0.2.1-rc.2 宿主上其 client 半可能被兼容性检查拒绝。 |
| [`dsh-find-plugin`](https://github.com/awesome-dsh-plugin/dsh-find-plugin)（npm 0.4.0） | **互补而非重复**：提供 `find_dsh_plugin` 工具（实时搜 GitHub `dsh-plugin` topic、按 star 排序、带安装命令）。本插件会自动检测并追加「优先用它」的条款。注意 0.4.0 的 peer range 覆盖到 0.1.7，未覆盖 0.2.1-rc.2。 |
| `dsh-prompt-studio` / `dsh-global-rules` / `dsh-rules` | 分别是提示词优化 UI、编辑 `$DSH_HOME/AGENTS.md`、按文件 glob 激活规则；都不提供「以任意 order 注入任意 system-prompt section」的能力，不满足本需求。 |

因此按三档评估属于**近似可特化**：没有可直接安装的「开源复用优先」成品插件，但存在可复用的挂载模式
（openharness-core-rule）与互补工具（dsh-find-plugin），本插件在模式上特化、规则正文自写。

### 更轻量的零代码替代

如果不想装插件，还有两条路：

1. **persona 前缀**（order 0）：在 `~/.dsh/profiles/desktop/cordis.patch.yml` 中覆盖 `system-prompt` 行：
   ```yaml
   - id: system-prompt
     config:
       personaPrefix: |
         ## 开源复用优先原则
         ...
   ```
   生效位置更早（persona 槽），但和部署 persona 混在一起，且没有 `context.agent` gating。
2. **`$DSH_HOME/AGENTS.md`**：写进用户全局指令文件，会被 `dsh-agent-instructions` 作为**user 角色**
   的持久上下文注入（开头明确「不覆盖 system/developer/direct user 指令」），优先级弱于 system 段，
   也不在 system prompt 中。适合轻量提醒，不适合硬约束。

---

## 文件结构

```
dsh-plugin-open-source-first/
├── package.json               # dsh.bundle.patch -> cordis.patch.yml
├── cordis.patch.yml           # 插入 id: open-source-first 行
├── lib/index.js               # 规则正文 + systemPrompt.section 注册
├── test/index.test.mjs        # node:test 单元测试
├── scripts/verify-in-app.mjs  # 对真实运行时服务的集成自检
└── README.md
```

## 开发

```sh
node --test test/index.test.mjs

ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  --expose-internals scripts/verify-in-app.mjs
```

## 许可

MIT。挂载模式参考 MIT 许可的 `openharness-core-rule`；规则正文为本仓库原创。
