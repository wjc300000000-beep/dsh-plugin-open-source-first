/**
 * dsh-plugin-open-source-first
 *
 * Injects the "open-source-first" workflow into the system prompt as an ordered
 * section: real search first, three-tier evaluation, then build.
 *
 * Mount pattern follows the published `openharness-core-rule` plugin (a
 * `systemPrompt.section()` registration gated on `context.agent`); this plugin
 * uses order 50 instead of 44 and ships its own rule text. It has no runtime
 * dependencies — the host supplies `ctx.systemPrompt`.
 *
 * @module dsh-plugin-open-source-first
 */

/** Cordis plugin name. */
export const name = 'open-source-first'

/** The prompt registry is the only service this plugin needs. */
export const inject = ['systemPrompt']

/** Section order: after the persona (0), before plan/team policy and tool guidance. */
export const DEFAULT_ORDER = 50

/** Section name; change it if another plugin registers the same name. */
export const DEFAULT_SECTION_NAME = 'open-source-first:rule'

/** Tool exposed by `dsh-find-plugin`; auto-detected when that plugin is mounted. */
export const FIND_PLUGIN_TOOL = 'find_dsh_plugin'

/**
 * The injected rule. Kept free of `{{...}}` groups: the prompt registry treats
 * them as strict variable references and would reject the whole assembly.
 */
export const RULE_TEXT = `## 开源复用优先原则（最高优先级工作流）

在开始任何开发、编码、构建功能或设计实现方案之前，必须先完成一次「开源现状检查」。这是强制前置步骤，不是建议。

### 触发条件
当用户提出以下类型的请求时，触发本流程：
- 「帮我做一个 / 写一个 / 实现一个……」
- 「有没有办法…… / 怎么做……」
- 涉及具体技术栈、工具链、功能模块、插件、脚本或方案设计的开发任务。

不触发：纯信息问答、代码解释、单行修复、格式化、改名。此类极小改动可以跳过检索，但必须在回复中写明「范围极小，未做开源检索」；一旦改动涉及新功能、新依赖、新文件或方案选型，立即按本流程执行。

### 第一步：执行真实检索（必须产生工具调用）
用当前可用的检索工具实际发起查询，不要只在推理里声称「考虑过开源方案」。至少覆盖以下查询：
1. 精确功能关键词 + dsh plugin（当目标是 DSH 插件生态时）
2. 精确功能关键词 + 目标语言或框架（如 Python / Node.js / React / CLI）
3. 同义表达变体（中英文各至少一次）

优先使用 web_search；需要 star 数、最近更新时间、issue 活跃度等结构化数据时，可以用 bash 调用 GitHub Search API（例如 curl -s "https://api.github.com/search/repositories?q=..."）。记录每一次查询词、所用工具、命中数量与代表项目。

### 第二步：三档评估
对最相关的 3–5 个结果，按 star 数、最近更新时间、README 完整度、issue/PR 活跃度判断，归入以下三档之一：
| 档位 | 判断标准 | 行动 |
|---|---|---|
| 成品可用 | 功能匹配、可安装即用 | 直接推荐，给出安装或接入方式，不要重写 |
| 近似可特化 | 核心机制相近，但缺少数个所需特性 | 基于该项目二次开发、配置或封装，明确标注「基于 X 项目特化」，附原项目链接与改造点清单 |
| 无合适基础 | 确实没有可复用或可特化的开源基础 | 进入自主开发，但必须在方案中声明检索结论 |

### 第三步：按档行动
- 成品可用：优先交付「使用/集成方案」，而不是「实现方案」。
- 近似可特化：交付「改造方案」，保留原项目链接和改造点清单。
- 无合适基础：交付「自研方案」，并在开头写明：「已完成 GitHub 检索，未发现可直接复用或可特化的项目。」

### 输出要求（可审计）
开发类任务的最终回复开头，先给出「开源现状检查」块，包含：检索方式与关键词、命中概况、三档结论、最终决策。让用户可以直接复核你是否真的检索过。

### 硬性约束
- 禁止在未执行检索工具调用的情况下直接给出自研方案。
- 禁止为了「展示能力」而跳过检索、重复造轮子。
- 检索工具因限流、网络或权限失败时，必须如实报告失败原因，并说明降级依据（例如改用 web_search、改用本地知识或直接自研），不得默默跳过。
- 同一任务内不要用相同关键词重复检索。`

/**
 * Build the optional tightening paragraph for deployments that mounted
 * `dsh-find-plugin`.
 *
 * @param tool - the visible tool name (`find_dsh_plugin` by default).
 * @returns the paragraph appended after {@link RULE_TEXT}.
 */
export function findPluginHint(tool) {
  return `本部署已提供 ${tool} 工具：检索 DSH 插件生态时必须先调用它（它实时搜索 GitHub 上打了 dsh-plugin topic 的仓库，并按 star 排序），再用 web_search 补充通用开源项目的检索。`
}

/**
 * Render the complete rule text.
 *
 * @param findPluginTool - visible plugin-search tool name, when one is available.
 * @returns the rule, optionally followed by the tightening paragraph.
 */
export function renderRule(findPluginTool) {
  return findPluginTool === undefined ? RULE_TEXT : `${RULE_TEXT}\n\n${findPluginHint(findPluginTool)}`
}

/**
 * Normalize plugin configuration without taking a schema dependency.
 *
 * @param config - raw row configuration from the profile patch.
 * @returns the effective options.
 */
function normalize(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const enabled = raw.enabled !== false
  const order = Number.isFinite(raw.order) ? raw.order : DEFAULT_ORDER
  const sectionName = typeof raw.sectionName === 'string' && raw.sectionName.trim() !== ''
    ? raw.sectionName.trim()
    : DEFAULT_SECTION_NAME
  return { enabled, order, sectionName, findPluginTool: raw.findPluginTool }
}

/**
 * Resolve the plugin-search tool the model can actually see. An explicit
 * `findPluginTool: 'name'` wins; `findPluginTool: false` disables the hint;
 * otherwise `find_dsh_plugin` is auto-detected through the tools registry.
 *
 * @param ctx - plugin context.
 * @param options - normalized options.
 * @param context - assembly context carrying the current agent.
 * @returns the visible tool name, or undefined.
 */
function resolveFindPluginTool(ctx, options, context) {
  if (options.findPluginTool === false) return undefined
  if (typeof options.findPluginTool === 'string' && options.findPluginTool.trim() !== '') {
    return options.findPluginTool.trim()
  }
  try {
    const tools = ctx.get?.('tools')
    if (tools === undefined || typeof tools.get !== 'function') return undefined
    return tools.get(FIND_PLUGIN_TOOL, context?.agent) === undefined ? undefined : FIND_PLUGIN_TOOL
  } catch {
    return undefined
  }
}

/**
 * Register the rule section. The text resolves per assembly so agent-scoped
 * tool visibility and later HMR mounts are reflected without remounting.
 *
 * @param ctx - Cordis plugin context carrying `ctx.systemPrompt`.
 * @param config - row configuration (`enabled`, `order`, `sectionName`, `findPluginTool`).
 * @returns a disposer that removes the section.
 */
export function apply(ctx, config) {
  const options = normalize(config)
  if (!options.enabled) return
  if (ctx?.systemPrompt === undefined || typeof ctx.systemPrompt.section !== 'function') {
    throw new Error('open-source-first: the systemPrompt service is unavailable; mount @deepseek-ai/dsh-system-prompt first')
  }
  const dispose = ctx.systemPrompt.section({
    name: options.sectionName,
    order: options.order,
    text: (context) => {
      // Only real agent assemblies get the rule; the registry also assembles
      // prompts for non-agent previews and other internal callers.
      if (context === undefined || context.agent === undefined || context.agent === null) return ''
      return renderRule(resolveFindPluginTool(ctx, options, context))
    },
  })
  return () => {
    try {
      dispose?.()
    } catch {
      // The section is already gone; disposal must stay idempotent.
    }
  }
}
