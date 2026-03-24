/**
 * ATA Protocol — AI Task Executor (standalone, zero OpenClaw dependency)
 *
 * Executes incoming ATA tasks by calling an LLM directly via the
 * OpenAI-compatible API (LiteLLM, Ollama, OpenAI, Anthropic proxy, etc.).
 *
 * Config (via .env):
 *   ATA_LLM_BASE_URL   e.g. http://localhost:4000/v1  (LiteLLM)
 *                           http://localhost:11434/v1  (Ollama)
 *                           https://api.openai.com/v1  (OpenAI)
 *   ATA_LLM_API_KEY    API key (use "ollama" for Ollama, any string for LiteLLM)
 *   ATA_LLM_MODEL      Model name, e.g. claude-sonnet-4-6, gpt-4o, llama3
 *   ATA_LLM_TIMEOUT    Request timeout in ms (default: 60000)
 *
 * Built-in handlers (always available, no LLM needed):
 *   ping   → { pong: true }
 *   echo   → { echo: content }
 *
 * All other actions → forwarded to the LLM as a system+user prompt.
 * The LLM's reply becomes the task result.
 *
 * Custom handlers:
 *   const { registerHandler } = require('./executor');
 *   registerHandler('my_action', async (task) => ({ result: { ... } }));
 *   Custom handlers take priority over the LLM fallback.
 */

'use strict';

const { postJson } = require('./http');

// ── Config ────────────────────────────────────────────────────────────────────

function getLLMConfig() {
  return {
    baseUrl: process.env.ATA_LLM_BASE_URL || 'http://localhost:4000/v1',
    apiKey:  process.env.ATA_LLM_API_KEY  || 'no-key',
    model:   process.env.ATA_LLM_MODEL    || 'claude-sonnet-4-6',
    timeout: parseInt(process.env.ATA_LLM_TIMEOUT || '60000', 10),
  };
}

// ── Built-in handlers (no LLM) ────────────────────────────────────────────────

const builtinHandlers = {
  ping: async (task) => ({
    result: { pong: true, from: task.from, taskId: task.taskId },
  }),
  echo: async (task) => ({
    result: { echo: task.payload?.content || '' },
  }),
};

// ── Custom handler registry ───────────────────────────────────────────────────

const customHandlers = {};

/**
 * Register a custom action handler. Takes priority over LLM fallback.
 * @param {string} action
 * @param {function} fn  async (task) => { result: any }
 */
function registerHandler(action, fn) {
  customHandlers[action] = fn;
}

// ── LLM execution ─────────────────────────────────────────────────────────────

/**
 * Call the LLM with the task content and return its reply.
 * Uses the OpenAI-compatible /chat/completions endpoint.
 */
async function callLLM(task) {
  const cfg = getLLMConfig();
  const action  = task.payload?.action || 'unknown';
  const content = task.payload?.content || '';

  const systemPrompt = [
    `You are an AI agent receiving a delegated task from another agent via the ATA (Agent-to-Agent) protocol.`,
    `Process the task and respond with a clear, helpful answer.`,
    `Action type: ${action}`,
    `Respond in the same language as the request content.`,
  ].join('\n');

  const userMessage = content || `Perform action: ${action}`;

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = {
    'Authorization': `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  };

  const { status, data } = await postJson(url, {
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  }, headers);

  if (status !== 200) {
    throw new Error(`LLM API returned ${status}: ${JSON.stringify(data)}`);
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error('LLM returned empty response');

  return { result: { answer: reply, model: cfg.model, action } };
}

// ── Main executor ─────────────────────────────────────────────────────────────

/**
 * Execute a received ATA task.
 *
 * Priority:
 *   1. Built-in handlers (ping, echo) — always instant
 *   2. Custom handlers (registered via registerHandler)
 *   3. LLM fallback (any action not handled above)
 *
 * @param {object} opts
 * @param {object} opts.task         Full ATA task object
 * @param {string} opts.callbackUrl  Where to POST the result
 * @returns {Promise<{ accepted: boolean, message: string }>}
 */
async function executeTask({ task, callbackUrl }) {
  const action = task.payload?.action;

  // Determine handler
  const handler = builtinHandlers[action] || customHandlers[action] || null;
  const mode = builtinHandlers[action] ? 'builtin'
              : customHandlers[action]  ? 'custom'
              : 'llm';

  console.log(`[ATA] Executor: "${action}" → ${mode}`);

  // Fire-and-forget execution
  setImmediate(async () => {
    try {
      console.log(`[ATA] Executing action "${action}" for task ${task.taskId} [${mode}]`);

      let result;
      if (handler) {
        ({ result } = await handler(task));
      } else {
        ({ result } = await callLLM(task));
      }

      await sendCallback(callbackUrl, { taskId: task.taskId, status: 'completed', result });
      console.log(`[ATA] ✓ Task ${task.taskId} completed [${mode}]`);
    } catch (err) {
      console.error(`[ATA] ✗ Task ${task.taskId} failed: ${err.message}`);
      await sendCallback(callbackUrl, {
        taskId: task.taskId,
        status: 'failed',
        result: { error: err.message },
      });
    }
  });

  return {
    accepted: true,
    message: mode === 'llm'
      ? `queued for LLM (${getLLMConfig().model})`
      : `handler "${action}" scheduled [${mode}]`,
  };
}

// ── Callback helper ───────────────────────────────────────────────────────────

async function sendCallback(url, payload) {
  if (!url) return;
  try {
    const { status } = await postJson(url, payload);
    console.log(`[ATA] Callback → ${url} (${status})`);
  } catch (err) {
    console.warn(`[ATA] Callback failed: ${err.message}`);
  }
}

module.exports = { executeTask, registerHandler };
