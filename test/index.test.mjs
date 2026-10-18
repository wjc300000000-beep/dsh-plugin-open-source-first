import test from 'node:test'
import assert from 'node:assert/strict'
import {
  apply,
  renderRule,
  RULE_TEXT,
  DEFAULT_ORDER,
  DEFAULT_SECTION_NAME,
  FIND_PLUGIN_TOOL,
  name,
  inject,
  findPluginHint,
} from '../lib/index.js'

/** Build a fake Cordis context exposing just the services this plugin uses. */
function makeCtx({ toolNames = [], throwingTools = false } = {}) {
  const registrations = []
  const ctx = {
    registrations,
    systemPrompt: {
      section(section) {
        registrations.push(section)
        return () => {
          section.disposed = true
        }
      },
    },
    get(service) {
      if (service !== 'tools') return undefined
      if (throwingTools) throw new Error('no tools view')
      return {
        get(toolName) {
          return toolNames.includes(toolName) ? { name: toolName } : undefined
        },
      }
    },
  }
  return ctx
}

test('exports a named plugin that injects systemPrompt', () => {
  assert.equal(name, 'open-source-first')
  assert.deepEqual(inject, ['systemPrompt'])
})

test('registers one section at order 50 with the default name', () => {
  const ctx = makeCtx()
  apply(ctx, {})
  assert.equal(ctx.registrations.length, 1)
  const [section] = ctx.registrations
  assert.equal(section.name, DEFAULT_SECTION_NAME)
  assert.equal(section.order, DEFAULT_ORDER)
  assert.equal(section.order, 50)
})

test('renders the rule only for real agent assemblies', () => {
  const ctx = makeCtx()
  apply(ctx, {})
  const { text } = ctx.registrations[0]
  assert.equal(text(), '')
  assert.equal(text({}), '')
  assert.equal(text({ agent: undefined }), '')
  const agentText = text({ agent: { id: 'agent-1' } })
  assert.ok(agentText.includes('开源复用优先原则'))
  assert.ok(agentText.includes('开源现状检查'))
  assert.ok(agentText.includes('三档评估'))
  assert.ok(agentText.includes('硬性约束'))
})

test('rule text contains no strict prompt-variable groups', () => {
  assert.equal(RULE_TEXT.includes('{{'), false)
  assert.equal(renderRule(undefined).includes('{{'), false)
  assert.equal(renderRule(FIND_PLUGIN_TOOL).includes('{{'), false)
})

test('disabled config registers nothing', () => {
  const ctx = makeCtx()
  assert.equal(apply(ctx, { enabled: false }), undefined)
  assert.equal(ctx.registrations.length, 0)
})

test('honours custom order and section name', () => {
  const ctx = makeCtx()
  apply(ctx, { order: 44, sectionName: 'custom:rule' })
  assert.equal(ctx.registrations[0].name, 'custom:rule')
  assert.equal(ctx.registrations[0].order, 44)
})

test('auto-detects find_dsh_plugin when the tool is visible', () => {
  const withTool = makeCtx({ toolNames: [FIND_PLUGIN_TOOL] })
  apply(withTool, {})
  const text = withTool.registrations[0].text({ agent: { id: 'a' } })
  assert.ok(text.includes(FIND_PLUGIN_TOOL))
  assert.ok(text.includes('必须'))

  const withoutTool = makeCtx()
  apply(withoutTool, {})
  const plain = withoutTool.registrations[0].text({ agent: { id: 'a' } })
  assert.equal(plain.includes(FIND_PLUGIN_TOOL), false)
})

test('explicit findPluginTool overrides auto-detection', () => {
  const ctx = makeCtx({ toolNames: [FIND_PLUGIN_TOOL] })
  apply(ctx, { findPluginTool: 'my_plugin_search' })
  const text = ctx.registrations[0].text({ agent: { id: 'a' } })
  assert.ok(text.includes('my_plugin_search'))
  assert.equal(text.includes(FIND_PLUGIN_TOOL), false)

  const off = makeCtx({ toolNames: [FIND_PLUGIN_TOOL] })
  apply(off, { findPluginTool: false })
  const noHint = off.registrations[0].text({ agent: { id: 'a' } })
  assert.equal(noHint.includes(FIND_PLUGIN_TOOL), false)
})

test('a broken tools service does not break assembly', () => {
  const ctx = makeCtx({ throwingTools: true })
  apply(ctx, {})
  const text = ctx.registrations[0].text({ agent: { id: 'a' } })
  assert.ok(text.includes('开源复用优先原则'))
  assert.equal(text.includes(FIND_PLUGIN_TOOL), false)
})

test('returns an idempotent disposer', () => {
  const ctx = makeCtx()
  const dispose = apply(ctx, {})
  assert.equal(typeof dispose, 'function')
  const [section] = ctx.registrations
  dispose()
  assert.equal(section.disposed, true)
  dispose()
})

test('fails loud when the systemPrompt service is missing', () => {
  assert.throws(() => apply({}, {}), /systemPrompt service is unavailable/)
})

test('findPluginHint names the configured tool', () => {
  assert.match(findPluginHint('find_dsh_plugin'), /find_dsh_plugin/)
})
