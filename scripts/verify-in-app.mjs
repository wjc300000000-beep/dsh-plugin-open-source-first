#!/usr/bin/env node
/**
 * Live integration check against the installed DeepSeek Harness runtime.
 *
 * It mounts the real `@deepseek-ai/dsh-system-prompt` service plus this plugin
 * in a bare Cordis context, assembles a prompt with and without an agent, and
 * verifies the rule lands between the persona (order 0) and plan/tool guidance.
 *
 * Run with the Desktop app's bundled Electron-as-Node:
 *
 *   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
 *     --expose-internals scripts/verify-in-app.mjs
 *
 * Override DSH_RUNTIME_DIR when the app lives elsewhere.
 */

import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import * as plugin from '../lib/index.js'

const runtimeDir = process.env.DSH_RUNTIME_DIR
  ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules'

const load = (relative) => import(pathToFileURL(join(runtimeDir, relative)).href)

const { Context } = await load('@deepseek-ai/cordis/lib/index.js')
const { default: SystemPrompt, renderPrompt } = await load('@deepseek-ai/dsh-system-prompt/lib/index.js')

const ctx = new Context()
await ctx.plugin(SystemPrompt, {
  includeHarnessIdentity: true,
  includeRuntimeContext: false,
  personaPrefix: 'VERIFY-PERSONA',
})
await ctx.plugin(plugin)

// Simulate first-party guidance that must render after the injected rule.
ctx.systemPrompt.section({ name: 'verify:plan-marker', order: 500, text: 'PLAN-MARKER' })
ctx.systemPrompt.section({ name: 'verify:tool-marker', order: 1000, text: 'TOOL-MARKER' })

const assembly = await ctx.systemPrompt.assemble({ agent: { id: 'verify-agent' } })
const names = assembly.sections.map((section) => section.name)
const ruleIndex = names.indexOf(plugin.DEFAULT_SECTION_NAME)

assert.notEqual(ruleIndex, -1, 'rule section is missing from the assembly')
assert.ok(names.indexOf('deployment:persona-prefix') < ruleIndex, 'rule must render after the persona')
assert.ok(names.indexOf('verify:plan-marker') > ruleIndex, 'rule must render before plan policy (order 500)')
assert.ok(names.indexOf('verify:tool-marker') > ruleIndex, 'rule must render before tool guidance (order 1000)')

const prompt = renderPrompt(assembly)
assert.ok(prompt.includes('开源复用优先原则'), 'rendered prompt misses the rule')
assert.ok(prompt.includes('开源现状检查'), 'rendered prompt misses the audit block requirement')
assert.ok(prompt.indexOf('VERIFY-PERSONA') < prompt.indexOf('开源复用优先原则'))

// Non-agent assembly (e.g. previews) must stay untouched.
const preview = await ctx.systemPrompt.assemble({})
assert.equal(preview.sections.find((section) => section.name === plugin.DEFAULT_SECTION_NAME)?.text, '')
assert.equal(renderPrompt(preview).includes('开源复用优先原则'), false)

console.log('OK  live assembly order:', names.filter((item) => item !== 'harness:identity').join(' -> '))
console.log('OK  rule length:', prompt.length, 'chars')
