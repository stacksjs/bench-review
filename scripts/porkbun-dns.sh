#!/bin/sh
# Ask Porkbun what it knows about a domain.
#
# Written because benchreview.org's records are an open question and the
# registrar/nameserver evidence disagrees with where the deploy tooling can
# write: WHOIS puts the domain at GoDaddy with NS1 nameservers
# (dns{1,3,4}.p02.nsone.net), while ts-cloud drives only Cloudflare,
# DigitalOcean, Porkbun and Route53. So the first question is not "what are
# the records" but "is this domain in the Porkbun account at all" — and
# `domain/listAll` answers that before `dns/retrieve` can mislead.
#
# Usage:
#   scripts/porkbun-dns.sh                      # defaults to benchreview.org
#   scripts/porkbun-dns.sh example.org
#   scripts/porkbun-dns.sh --env-file ../other/.env.production example.org
#
# Credentials come from PORKBUN_API_KEY and PORKBUN_SECRET_KEY in the
# environment, or from an env file named with --env-file. They are never
# printed, never passed as command-line arguments (argv is world-readable via
# `ps`), and never written to disk: the request body is built in-process and
# handed to curl on stdin.

set -eu

DOMAIN=""
ENV_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file)
      [ $# -ge 2 ] || { echo "--env-file needs a path" >&2; exit 2; }
      ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
    *)
      DOMAIN="$1"
      shift
      ;;
  esac
done

[ -n "$DOMAIN" ] || DOMAIN="benchreview.org"

if [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || { echo "No such env file: $ENV_FILE" >&2; exit 2; }
  # Only the two keys, so an env file full of other secrets does not get
  # pulled wholesale into this shell.
  for name in PORKBUN_API_KEY PORKBUN_SECRET_KEY; do
    value=$(grep -E "^${name}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')
    [ -n "$value" ] && export "$name=$value"
  done
fi

# ⚠️ An ENCRYPTED value is not a missing one, and Porkbun cannot tell the
# difference — it just answers "Invalid API key", which sends you looking for
# a revoked key instead of a decryption step. The HQ apps keep these
# dotenv-encrypted (`encrypted:…`, ~376 chars) with the private key in an
# ignored .env.keys, so a raw grep of .env.production hands you ciphertext
# that looks exactly like a credential.
for name in PORKBUN_API_KEY PORKBUN_SECRET_KEY; do
  eval "value=\${$name:-}"
  case "$value" in
    encrypted:*|encr*)
      cat >&2 <<MSG
$name holds an ENCRYPTED value, not a usable key.

These env files are dotenv-encrypted and the private key lives in the
project's own .env.keys. Decrypt there and export the plaintext, e.g.

  export PORKBUN_API_KEY=\$(cd /path/to/that/project && bunx dotenvx get PORKBUN_API_KEY)

Porkbun answers "Invalid API key" for ciphertext, so the error you would
otherwise get points at the wrong thing entirely.
MSG
      exit 2
      ;;
  esac
done

if [ -z "${PORKBUN_API_KEY:-}" ] || [ -z "${PORKBUN_SECRET_KEY:-}" ]; then
  cat >&2 <<'MSG'
PORKBUN_API_KEY and PORKBUN_SECRET_KEY must be set.

  export PORKBUN_API_KEY=pk1_...
  export PORKBUN_SECRET_KEY=sk1_...

or point at a file that already has them:

  scripts/porkbun-dns.sh --env-file ~/path/to/.env.production

Create a key at https://porkbun.com/account/api — and note that Porkbun also
requires API ACCESS to be switched on per domain, in the domain's own
settings, before the DNS endpoints will answer for it.
MSG
  exit 2
fi

API="https://api.porkbun.com/api/json/v3"

# Build the JSON in python so the secrets are escaped correctly and never
# appear in argv. `extra` lets a caller add fields without string-mashing.
body() {
  python3 -c '
import json, os, sys
payload = {"apikey": os.environ["PORKBUN_API_KEY"], "secretapikey": os.environ["PORKBUN_SECRET_KEY"]}
sys.stdout.write(json.dumps(payload))
'
}

call() {
  # $1 = path under the API root. Body on stdin keeps the keys out of `ps`.
  body | curl --silent --show-error --max-time 30 \
    --header 'Content-Type: application/json' \
    --data @- "$API/$1"
}

echo "== credentials =="
PING=$(call ping)
printf '%s' "$PING" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print("  Porkbun did not return JSON - check network access.")
    raise SystemExit(1)
if data.get("status") == "SUCCESS":
    # yourIp is the only field here and is not a secret.
    ip = data.get("yourIp", "?")
    print("  OK (Porkbun sees this machine as " + str(ip) + ")")
else:
    print("  REFUSED: " + str(data.get("message", data)))
    raise SystemExit(1)
'

echo
echo "== domains in this Porkbun account =="
DOMAINS=$(call domain/listAll)
printf '%s' "$DOMAINS" | DOMAIN="$DOMAIN" python3 -c '
import json, os, sys
target = os.environ["DOMAIN"]
data = json.load(sys.stdin)
if data.get("status") != "SUCCESS":
    print("  could not list: " + str(data.get("message", data)))
    raise SystemExit(0)
names = sorted(d.get("domain", "?") for d in data.get("domains", []))
if not names:
    print("  (none)")
for n in names:
    mark = "   <- asked about" if n == target else ""
    print("  " + n + mark)
print()
if target in names:
    print("  " + target + " IS in this account.")
else:
    print("  " + target + " is NOT in this account - Porkbun cannot hold records")
    print("  for a domain it does not have. Check registrar and nameservers:")
    print("    whois " + target)
'

echo
echo "== DNS records for $DOMAIN =="
RECORDS=$(call "dns/retrieve/$DOMAIN")
printf '%s' "$RECORDS" | python3 -c '
import json, sys
data = json.load(sys.stdin)
if data.get("status") != "SUCCESS":
    msg = data.get("message", data)
    print("  " + str(msg))
    # The usual cause is not a bad key.
    if "not opted in" in str(msg).lower() or "api access" in str(msg).lower():
        print("  -> switch API ACCESS on for this domain in its Porkbun settings.")
    raise SystemExit(0)
rows = data.get("records", [])
if not rows:
    print("  (no records)")
    raise SystemExit(0)
width = max(len(r.get("type", "")) for r in rows)
for r in sorted(rows, key=lambda r: (r.get("type", ""), r.get("name", ""))):
    name = r.get("name") or "(apex)"
    ttl = str(r.get("ttl", ""))
    kind = r.get("type", "")
    content = r.get("content", "")
    print("  " + kind.ljust(width) + "  " + name.ljust(34) + " " + content + "  (ttl " + ttl + ")")
print()
print("  " + str(len(rows)) + " record(s)")
'
