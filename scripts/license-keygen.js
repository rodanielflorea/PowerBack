// Generates the Ed25519 license keypair.
//   license-admin/keys/private.key — SIGNS licenses; lives with the admin app.
//     Anyone who has this file (or repo access) can mint licenses.
//   license-public.key             — embedded in the user app; verify-only.
// Re-running rotates the pair: old licenses stop validating in apps built
// with the new public key, so rebuild and redistribute after rotating.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIV = path.join(__dirname, '..', 'license-admin', 'keys', 'private.key');
const PUB = path.join(__dirname, '..', 'license-public.key');

if (fs.existsSync(PRIV) && !process.argv.includes('--rotate')) {
  console.error('Keypair already exists. Use --rotate to replace it (invalidates all issued licenses).');
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(PRIV), { recursive: true });
fs.writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync(PUB, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Wrote', PRIV);
console.log('Wrote', PUB);
