// electron-builder afterSign hook.
// When no Developer ID certificate is configured, electron-builder skips
// signing entirely and the app bundle ends up with an INVALID signature
// (Electron's own ad-hoc signature no longer matches the modified bundle).
// macOS then cannot recognise the app as the same app between launches, so
// every permission grant (microphone, system audio, screen, accessibility)
// is forgotten and the prompts come back on each start.
// Give the whole bundle — helpers included — a consistent ad-hoc signature.
// A real Developer ID signature (CSC_LINK set) makes this hook a no-op.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return; // properly signed already
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  if (!fs.existsSync(appPath)) return;
  const entitlements = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');
  const ent = fs.existsSync(entitlements) ? ` --entitlements "${entitlements}"` : '';
  console.log(`  • ad-hoc signing ${appName} (no certificate configured)`);
  execSync(`codesign --force --deep --sign -${ent} --timestamp=none "${appPath}"`, { stdio: 'inherit' });
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
};
