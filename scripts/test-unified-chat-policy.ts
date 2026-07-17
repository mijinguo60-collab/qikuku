import { loadEnvConfig } from '@next/env';
import fs from 'node:fs';
import { getEnabledModels, getServerModelCatalog } from '../lib/ai/model-catalog';
import { buildUnifiedSystemPrompt } from '../lib/ai/unified-chat';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

loadEnvConfig(process.cwd());
const catalog = getServerModelCatalog();
const requiredDisplayNames = ['MiniMax-M3', 'DeepSeek V4 Flash', 'DeepSeek V4 Pro', 'Kimi-K2.6', 'GLM-5.2', 'GPT-5.4', 'GPT-5.4 mini', 'GPT-5.5', 'GPT-5.6 Luna', 'GPT-5.6 Sol', 'GPT-5.6 Terra', 'Claude Haiku 4.5', 'Claude Sonnet 4.6', 'Claude Opus 4.6', 'Claude Opus 4.7', 'Claude Opus 4.8', 'Gemini 3 Flash Preview', 'Gemini 3.1 Pro Preview', 'Gemini 3.5 Flash', 'Qwen3.6-27B'];

for (const displayName of requiredDisplayNames) assert(catalog.some((model) => model.displayName === displayName), `missing reference model: ${displayName}`);
for (const model of getEnabledModels()) {
  assert(Boolean(model.providerModelId), `${model.id} enabled without provider model ID`);
  assert(model.supportsText, `${model.id} enabled without text capability`);
}
for (const model of catalog.filter((entry) => !entry.enabled)) assert(model.providerModelId === null, `${model.id} must not invent an unverified provider ID`);
const gptEntries = catalog.filter((entry) => entry.provider === 'openai');
const expectedGptIds = ['gpt-54', 'gpt-54-mini', 'gpt-55', 'gpt-56-luna', 'gpt-56-sol', 'gpt-56-terra'];
assert(gptEntries.length === expectedGptIds.length, 'GPT reference catalogue must contain exactly the six configured display entries');
assert(gptEntries.every((entry) => expectedGptIds.includes(entry.id)), 'GPT reference catalogue contains an unapproved model');
for (const model of gptEntries) {
  assert(model.enabled, `${model.id} must be enabled only after the recorded live validation`);
  assert(model.providerModelId?.startsWith('gpt-'), `${model.id} must use its verified upstream GPT model ID`);
  assert(model.supportsText && model.supportsStreaming && model.supportsParsedDocument, `${model.id} must retain its verified text, streaming and parsed-document capabilities`);
  assert(!model.supportsVision && !model.supportsNativeFileInput && !model.supportsWebSearch && !model.supportsFileSearch && !model.supportsToolCalling, `${model.id} must not claim unverified provider capabilities`);
}
const deepSeekEntries = catalog.filter((entry) => entry.provider === 'deepseek');
const expectedDeepSeekIds = ['deepseek-v4-flash', 'deepseek-v4-pro'];
assert(deepSeekEntries.length === expectedDeepSeekIds.length, 'DeepSeek catalogue must contain exactly the two approved entries');
assert(deepSeekEntries.every((entry) => expectedDeepSeekIds.includes(entry.id)), 'DeepSeek catalogue contains an unapproved model');
for (const model of deepSeekEntries) {
  assert(model.enabled && model.providerModelId === model.id, `${model.id} must use its verified exact provider model ID`);
  assert(model.supportsText && model.supportsStreaming && model.supportsParsedDocument, `${model.id} must retain verified text, streaming and parsed-document capabilities`);
  assert(!model.supportsVision && !model.supportsNativeFileInput && !model.supportsWebSearch && !model.supportsFileSearch && !model.supportsToolCalling, `${model.id} must not claim unverified provider capabilities`);
}
const geminiEntries = catalog.filter((entry) => entry.provider === 'google');
const expectedGeminiIds = ['gemini-3-flash-preview', 'gemini-31-pro-preview', 'gemini-35-flash'];
assert(geminiEntries.length === expectedGeminiIds.length, 'Gemini catalogue must contain exactly the three approved entries');
assert(geminiEntries.every((entry) => expectedGeminiIds.includes(entry.id)), 'Gemini catalogue contains an unapproved model');
for (const model of geminiEntries) {
  assert(model.enabled && model.providerModelId, `${model.id} must expose its verified exact provider model ID when Gemini credentials are configured`);
  assert(model.supportsText && model.supportsStreaming && model.supportsParsedDocument, `${model.id} must retain verified text, streaming and parsed-document capabilities`);
  assert(!model.supportsVision && !model.supportsNativeFileInput && !model.supportsWebSearch && !model.supportsFileSearch && !model.supportsToolCalling, `${model.id} must not claim unavailable provider capabilities`);
}
const claudeEntries = catalog.filter((entry) => entry.provider === 'anthropic');
const expectedClaudeIds = ['claude-haiku-45', 'claude-sonnet-46', 'claude-opus-46', 'claude-opus-47', 'claude-opus-48'];
assert(claudeEntries.length === expectedClaudeIds.length, 'Claude catalogue must contain exactly the five approved entries');
assert(claudeEntries.every((entry) => expectedClaudeIds.includes(entry.id)), 'Claude catalogue contains an unapproved model');
for (const model of claudeEntries) {
  assert(model.enabled && model.providerModelId, `${model.id} must expose its verified exact provider model ID when Claude credentials are configured`);
  assert(model.supportsText && model.supportsStreaming && model.supportsParsedDocument, `${model.id} must retain verified text, streaming and parsed-document capabilities`);
  assert(!model.supportsVision && !model.supportsNativeFileInput && !model.supportsWebSearch && !model.supportsFileSearch && !model.supportsToolCalling, `${model.id} must not claim unavailable provider capabilities`);
}

const sourcePrompt = buildUnifiedSystemPrompt([{ content: '企业审批流程为双人复核', documentId: 'document-a', knowledgeSpaceId: 'space-a', score: 0.9, source: '审批制度.md' }], null, false);
assert(sourcePrompt.includes('审批制度.md') && sourcePrompt.includes('双人复核'), 'knowledge source must be injected into the unified prompt');
const noSourcePrompt = buildUnifiedSystemPrompt([], null, false);
assert(noSourcePrompt.includes('当前知识库中未找到足够依据'), 'missing knowledge must produce a no-evidence instruction');
const skillPrompt = buildUnifiedSystemPrompt([], { id: 'skill-a', name: '经营诊断', description: 'x', systemPrompt: '按经营框架分析', framework: '经营框架', outputSchema: null }, false);
assert(skillPrompt.includes('经营诊断') && skillPrompt.includes('按经营框架分析'), 'Skill must be injected after enterprise knowledge rules');
const ragSource = fs.readFileSync(new URL('../lib/ai/rag-pipeline.ts', import.meta.url), 'utf8');
assert(ragSource.includes('kc."companyId" = ? AND d."companyId" = ?'), 'RAG query must constrain both chunk and document company IDs');

console.log(JSON.stringify({ ok: true, catalogCount: catalog.length, enabledCount: getEnabledModels().length }));
