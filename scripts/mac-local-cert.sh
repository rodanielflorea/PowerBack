#!/usr/bin/env bash
# Creates "Ace Local Signing", a self-signed code-signing certificate in the
# login keychain, once per Mac. Local builds signed with it keep the same
# identity from one build to the next, so macOS remembers the Microphone and
# Screen & System Audio Recording permissions. An ad-hoc signature is
# identified by a hash of the exact build instead, and each rebuild loses them.
# Run by `npm run build:mac` / `build:mac-legacy`; does nothing if it exists.
set -euo pipefail
NAME="Ace Local Signing"
[ "$(uname)" = "Darwin" ] || exit 0
if security find-certificate -c "$NAME" >/dev/null 2>&1; then
  echo "mac-local-cert: \"$NAME\" already in the keychain"
  exit 0
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/cert.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$TMP/cert.cnf" \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null
openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -name "$NAME" -passout pass:ace -out "$TMP/cert.p12"
security import "$TMP/cert.p12" -k "$HOME/Library/Keychains/login.keychain-db" \
  -P ace -T /usr/bin/codesign
echo "mac-local-cert: created \"$NAME\""
