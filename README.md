# ATA Standalone

**Personal Agent-to-Agent protocol. Zero dependencies. Any LLM.**

Send a task to a remote AI agent, get the result back. No platform, no registration, no cloud required.

```
You (Client)                    Your friend (Server)
ata-client.js  ──HTTP──────>   ata-server.js
                               └── LLM processes task
               <──result────   └── POST callback
```

## Quick Start

```bash
# Clone & configure
git clone https://github.com/JackyCufe/ata-standalone
cd ata-standalone
cp .env.example .env
# Edit .env: set ATA_SHARED_SECRET and ATA_LLM_* to match your LLM

# Terminal 1: start your agent server
node ata-server.js

# Terminal 2: send a task
node ata-client.js \
  --to http://localhost:3740/ata/v1 \
  --task '{"action":"ask_agent","content":"用一句话解释量子力学"}' \
  --secret your-shared-secret
```

The result comes back automatically once the LLM finishes:

```json
{
  "status": "completed",
  "result": {
    "answer": "量子力学是描述微观粒子行为的物理理论...",
    "model": "claude-sonnet-4-6",
    "action": "ask_agent"
  }
}
```

## How It Works

1. **Client** fetches the server's Agent Card (`GET /ata/v1/agent-card`) to discover capabilities
2. **Client** signs a task request with HMAC-SHA256 and POSTs it (`POST /ata/v1/task`)
3. **Server** verifies the signature, stores the task, returns HTTP 202 immediately
4. **Server** routes the task to the executor:
   - `ping` / `echo` → built-in handlers (instant, no LLM)
   - everything else → calls your LLM via OpenAI-compatible API
5. **Executor** POSTs the result to the callback URL
6. **Client** polls `/ata/v1/task/:id/status` until `status: completed`

## LLM Backends

Any OpenAI-compatible endpoint works. Set in `.env`:

| Backend | `ATA_LLM_BASE_URL` | `ATA_LLM_API_KEY` | `ATA_LLM_MODEL` |
|---|---|---|---|
| LiteLLM (local) | `http://localhost:4000/v1` | `no-key` | `claude-sonnet-4-6` |
| Ollama (local, free) | `http://localhost:11434/v1` | `ollama` | `llama3` |
| OpenAI | `https://api.openai.com/v1` | `sk-...` | `gpt-4o` |

## Custom Handlers

Register your own action handlers (they take priority over the LLM):

```js
const { registerHandler } = require('./lib/executor');

// Fast, deterministic handlers skip the LLM entirely
registerHandler('get_weather', async (task) => {
  const data = await fetchWeather(task.payload.city);
  return { result: data };
});

registerHandler('review_code', async (task) => {
  // Or call your own LLM with a custom prompt
  const review = await myCustomLLM(task.payload.code);
  return { result: { review } };
});
```

## Security

- **HMAC-SHA256 signing**: every request is signed with a shared secret
- **Idempotency**: duplicate task IDs are rejected (prevents replay attacks)
- **No central registry**: you only talk to agents whose URL you know
- **No platform**: your data never touches a third-party server

## Protocol

```
POST /ata/v1/task
{
  "from": "agent://alice/main",
  "to": "agent://bob/assistant",
  "taskId": "<uuid>",
  "type": "task_request",
  "payload": { "action": "ask_agent", "content": "..." },
  "callbackUrl": "http://alice.example.com/ata/v1/callback/<uuid>",
  "timestamp": 1234567890,
  "signature": "<hmac-sha256>"
}
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/ata/v1/agent-card` | Agent capabilities & identity |
| `POST` | `/ata/v1/task` | Submit a task |
| `POST` | `/ata/v1/callback/:taskId` | Receive result (for servers) |
| `GET` | `/ata/v1/task/:taskId/status` | Poll task status |
| `GET` | `/health` | Health check |

## Comparison

| | ATA Standalone | Google A2A | Society Protocol |
|---|---|---|---|
| Zero dependencies | ✅ | ❌ SDK required | ❌ libp2p |
| Personal use | ✅ | ❌ Enterprise | 🔶 |
| Any LLM backend | ✅ | ❌ | ❌ |
| Task callback guarantee | ✅ | ✅ | ❌ broadcast only |
| One command startup | ✅ | ❌ | 🔶 |

## License

MIT
