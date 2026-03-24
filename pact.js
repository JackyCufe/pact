#!/usr/bin/env node
'use strict';
require('./lib/env');
const { generateKeyPairSync, createPublicKey } = require('crypto');
const fs = require('fs');
const path = require('path');

const cmd = process.argv[2];

if (cmd === 'keygen') {
  const dir = path.join(process.cwd(), '.pact');
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const identity = { privateKey, publicKey, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, 'identity.json'), JSON.stringify(identity, null, 2));
  const pubKeyObj = createPublicKey(publicKey);
  const rawPub = pubKeyObj.export({ type: 'spki', format: 'der' }).slice(-32).toString('base64');
  console.log('✅ Identity generated: .pact/identity.json');
  console.log('📤 Your public key (share with peers):');
  console.log('   ' + rawPub);
} else if (cmd === 'server') {
  process.argv = [...process.argv.slice(0,2), ...process.argv.slice(3)];
  require('./ata-server');
} else if (cmd === 'send') {
  process.argv = [...process.argv.slice(0,2), ...process.argv.slice(3)];
  require('./ata-client');
} else {
  console.log('PACT — Personal Agent Communication Treaty');
  console.log('');
  console.log('Usage:');
  console.log('  node pact.js keygen            # generate Ed25519 identity');
  console.log('  node pact.js server            # start agent server');
  console.log('  node pact.js server --tunnel   # start + expose public URL');
  console.log('  node pact.js send --to <url> --task <json>');
}
