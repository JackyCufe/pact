#!/usr/bin/env node
'use strict';
require('./lib/env');
const { generateKeyPairSync, createPublicKey, randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

const PACT_DIR = path.join(process.cwd(), '.pact');
const IDENTITY_FILE = path.join(PACT_DIR, 'identity.json');
const PEERS_FILE = path.join(PACT_DIR, 'peers.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir() {
  fs.mkdirSync(PACT_DIR, { recursive: true });
}

function loadIdentity() {
  if (!fs.existsSync(IDENTITY_FILE)) return null;
  return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
}

function loadPeers() {
  if (!fs.existsSync(PEERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
}

function savePeers(peers) {
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
}

// ── Commands ──────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

// ── keygen ────────────────────────────────────────────────────────────────────
if (cmd === 'keygen') {
  ensureDir();
  if (fs.existsSync(IDENTITY_FILE)) {
    console.log('⚠️  Identity already exists at .pact/identity.json');
    console.log('   Delete it first if you want to regenerate.');
    process.exit(1);
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const identity = {
    privateKey,
    publicKey,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2));
  const rawPub = createPublicKey(publicKey)
    .export({ type: 'spki', format: 'der' })
    .slice(-32)
    .toString('base64');
  console.log('✅ Identity generated: .pact/identity.json');
  console.log('📤 Your public key:');
  console.log('   ' + rawPub);
  console.log('');
  console.log('Next: node pact.js invite  →  create an invite code for a peer');

// ── invite ────────────────────────────────────────────────────────────────────
} else if (cmd === 'invite') {
  const identity = loadIdentity();
  if (!identity) {
    console.error('❌ No identity found. Run: node pact.js keygen');
    process.exit(1);
  }

  // Read endpoint from env or args
  const endpoint = process.argv[3] || process.env.ATA_PUBLIC_URL || 'http://localhost:3740';

  // Generate a one-time shared secret
  const secret = randomBytes(24).toString('base64url');

  // Build invite payload: { endpoint, secret, agentId, agentName }
  const payload = {
    v: 1,
    endpoint,
    secret,
    agentId:   process.env.ATA_AGENT_ID   || 'agent://unknown/main',
    agentName: process.env.ATA_AGENT_NAME || 'PACT Agent',
  };

  const code = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // Save the secret locally so our server will accept it
  ensureDir();
  const peers = loadPeers();
  peers[`invite_${Date.now()}`] = { secret, endpoint, createdAt: new Date().toISOString(), used: false };
  savePeers(peers);

  // Also write it to .env if ATA_SHARED_SECRET is not set
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (!envContent.includes('ATA_SHARED_SECRET=') || envContent.includes('ATA_SHARED_SECRET=change-this')) {
      envContent = envContent.replace(/ATA_SHARED_SECRET=.*/, `ATA_SHARED_SECRET=${secret}`);
      fs.writeFileSync(envPath, envContent);
      console.log('✅ .env updated with new shared secret');
    }
  }

  console.log('');
  console.log('🎫 Invite Code (send this to your peer via any channel):');
  console.log('');
  console.log('   ' + code);
  console.log('');
  console.log('Peer runs:');
  console.log(`   node pact.js join ${code}`);
  console.log('');
  console.log('⚠️  This invite includes a shared secret. Send via Signal/iMessage/DM — not public channels.');

// ── join ──────────────────────────────────────────────────────────────────────
} else if (cmd === 'join') {
  const code = process.argv[3];
  if (!code) {
    console.error('Usage: node pact.js join <invite-code>');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
  } catch {
    console.error('❌ Invalid invite code');
    process.exit(1);
  }

  if (!payload.v || !payload.endpoint || !payload.secret) {
    console.error('❌ Malformed invite code (missing fields)');
    process.exit(1);
  }

  // Save peer info
  ensureDir();
  const peers = loadPeers();
  const peerId = payload.agentId || payload.endpoint;
  peers[peerId] = {
    agentId:   payload.agentId,
    agentName: payload.agentName,
    endpoint:  payload.endpoint,
    secret:    payload.secret,
    joinedAt:  new Date().toISOString(),
  };
  savePeers(peers);

  console.log('');
  console.log(`✅ Peer added: ${payload.agentName || payload.agentId}`);
  console.log(`   Endpoint: ${payload.endpoint}`);
  console.log('');
  console.log('Send a task:');
  console.log(`   node pact.js send \\`);
  console.log(`     --to ${payload.endpoint}/ata/v1 \\`);
  console.log(`     --task '{"action":"ask_agent","content":"hello"}' \\`);
  console.log(`     --secret ${payload.secret}`);

// ── peers ─────────────────────────────────────────────────────────────────────
} else if (cmd === 'peers') {
  const peers = loadPeers();
  const list = Object.entries(peers).filter(([k]) => !k.startsWith('invite_'));
  if (list.length === 0) {
    console.log('No peers yet. Run: node pact.js join <invite-code>');
  } else {
    console.log(`${list.length} peer(s):\n`);
    list.forEach(([id, p]) => {
      console.log(`  ${p.agentName || id}`);
      console.log(`    ID:       ${p.agentId}`);
      console.log(`    Endpoint: ${p.endpoint}`);
      console.log(`    Added:    ${p.joinedAt}`);
      console.log('');
    });
  }

// ── server ────────────────────────────────────────────────────────────────────
} else if (cmd === 'server') {
  process.argv = [...process.argv.slice(0, 2), ...process.argv.slice(3)];
  require('./ata-server');

// ── send ──────────────────────────────────────────────────────────────────────
} else if (cmd === 'send') {
  process.argv = [...process.argv.slice(0, 2), ...process.argv.slice(3)];
  require('./ata-client');

// ── help ──────────────────────────────────────────────────────────────────────
} else {
  console.log('PACT — Personal Agent Communication Treaty');
  console.log('Zero dependencies. Any LLM. P2P Agent task delegation.');
  console.log('');
  console.log('Setup:');
  console.log('  node pact.js keygen                    # generate identity (first time)');
  console.log('  node pact.js invite [endpoint]         # create invite code to share');
  console.log('  node pact.js join <code>               # accept peer invite');
  console.log('  node pact.js peers                     # list known peers');
  console.log('');
  console.log('Run:');
  console.log('  node pact.js server                    # start agent server');
  console.log('  node pact.js server --tunnel           # start + auto-expose public URL');
  console.log('');
  console.log('Send tasks:');
  console.log('  node pact.js send --to <url> --task <json> --secret <secret>');
}
