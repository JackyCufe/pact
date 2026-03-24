/**
 * ATA Protocol — Configuration loader (standalone)
 */
'use strict';

function loadConfig() {
  return {
    // Agent identity
    agentId:      process.env.ATA_AGENT_ID      || 'agent://unknown/main',
    agentName:    process.env.ATA_AGENT_NAME     || 'ATA Agent',
    agentOwner:   process.env.ATA_AGENT_OWNER    || 'unknown',
    agentVersion: '0.1.0',

    // Server
    host:      process.env.ATA_HOST       || '0.0.0.0',
    port:      parseInt(process.env.ATA_PORT || '3740', 10),
    publicUrl: process.env.ATA_PUBLIC_URL || 'http://localhost:3740',

    // Security
    sharedSecret: process.env.ATA_SHARED_SECRET || '',

    // Capabilities advertised in agent card
    capabilities: (process.env.ATA_CAPABILITIES || 'ping,echo,ask_agent')
      .split(',').map(s => s.trim()).filter(Boolean),

    // Storage
    dataDir: process.env.ATA_DATA_DIR || './data',

    // Task lifecycle
    taskTtlMs:      parseInt(process.env.ATA_TASK_TTL_MS      || String(24 * 60 * 60 * 1000), 10),
    pollTimeoutMs:  parseInt(process.env.ATA_POLL_TIMEOUT_MS  || '30000', 10),
    pollIntervalMs: parseInt(process.env.ATA_POLL_INTERVAL_MS || '1000', 10),

    // LLM (for executor)
    llm: {
      baseUrl: process.env.ATA_LLM_BASE_URL || 'http://localhost:4000/v1',
      apiKey:  process.env.ATA_LLM_API_KEY  || 'no-key',
      model:   process.env.ATA_LLM_MODEL    || 'claude-sonnet-4-6',
      timeout: parseInt(process.env.ATA_LLM_TIMEOUT || '60000', 10),
    },
  };
}

module.exports = { loadConfig };
