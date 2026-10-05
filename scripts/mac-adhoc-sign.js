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

const LOCAL_IDENTITY = 'Ace Local Signing';
function hasLocalIdentity() {
  try { execSync(`security find-certificate -c "${LOCAL_IDENTITY}"`, { stdio: 'ignore' }); return true; } catch { return false; }
}

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return; // properly signed already
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  if (!fs.existsSync(appPath)) return;
  const entitlements = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');
  const ent = fs.existsSync(entitlements) ? ` --entitlements "${entitlements}"` : '';
  // An ad-hoc signature is identified by a hash of this exact build, so macOS
  // forgets the Microphone / Screen Recording permissions on every rebuild.
  // The self-signed "Ace Local Signing" certificate (scripts/mac-local-cert.sh)
  // keeps one identity across builds; ad-hoc remains the fallback (CI).
  const identity = hasLocalIdentity() ? LOCAL_IDENTITY : '-';
  console.log(identity === '-'
    ? `  • ad-hoc signing ${appName} (no certificate configured)`
    : `  • signing ${appName} with "${LOCAL_IDENTITY}" (permissions survive rebuilds)`);
  // --deep does not reach executables under Resources: sign the helper first.
  const helper = path.join(appPath, 'Contents', 'Resources', 'mac-audio', 'system-audio');
  if (fs.existsSync(helper)) execSync(`codesign --force --sign "${identity}" --timestamp=none "${helper}"`, { stdio: 'inherit' });
  execSync(`codesign --force --deep --sign "${identity}"${ent} --timestamp=none "${appPath}"`, { stdio: 'inherit' });
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
};
