#!/bin/sh
# Put benchreview.org's records in front of a server, in Netlify DNS.
#
# ## Which provider, and how we know
#
# The zone is NETLIFY DNS, not Porkbun and not NS1 directly. Porkbun does not
# hold the domain (checked). WHOIS puts the registration at GoDaddy. But the
# nameservers are dns{1,2,3,4}.p02.nsone.net and the zone's SOA names
# `domains+netlify@netlify.com` as the responsible party — Netlify DNS runs on
# NS1 infrastructure, so those are Netlify's nameservers. The zone answers
# NOERROR and is empty: it was created (serial dates it to 2025-06-02, days
# after the domain was registered) and never given records.
#
# ⚠️ ts-cloud CANNOT write here. It drives Cloudflare, DigitalOcean, Porkbun
# and Route53 only, so `./buddy deploy` will not reconcile this zone however
# it is configured. That is the whole reason this script exists.
#
# ## Order of operations
#
# An A record needs an IP and the IP comes from the box, so this runs AFTER
# the server exists, not before. Nothing here provisions anything.
#
# ## The apex is canonical, deliberately
#
# config/mobile.ts names the bare apex in `trustedOrigins` and
# `associatedDomains: ['applinks:benchreview.org']`, and site.config.ts sets
# `url = 'https://benchreview.org'`. Universal links match the apex exactly,
# so www must be the alias and the apex must be the real thing — the other way
# round silently breaks every universal link while the site looks fine.
#
# Usage:
#   scripts/dns-records.sh 1.2.3.4                 # show the plan, change nothing
#   scripts/dns-records.sh --apply 1.2.3.4         # actually write the records
#   scripts/dns-records.sh --domain example.org 1.2.3.4
#   scripts/dns-records.sh --env-file ~/x/.env --apply 1.2.3.4
#
# NETLIFY_AUTH_TOKEN comes from the environment or --env-file. It is never
# printed, never passed in argv (readable via `ps`) and never written to disk.
# Create one at https://app.netlify.com/user/applications#personal-access-tokens

set -eu

DOMAIN="benchreview.org"
IP=""
APPLY=""
ENV_FILE=""
TTL=3600

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --domain)
      [ $# -ge 2 ] || { echo "--domain needs a value" >&2; exit 2; }
      DOMAIN="$2"; shift 2 ;;
    --env-file)
      [ $# -ge 2 ] || { echo "--env-file needs a path" >&2; exit 2; }
      ENV_FILE="$2"; shift 2 ;;
    --ttl)
      [ $# -ge 2 ] || { echo "--ttl needs a value" >&2; exit 2; }
      TTL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,44p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) IP="$1"; shift ;;
  esac
done

if [ -z "$IP" ]; then
  echo "Need the server's IP address. The box has to exist first:" >&2
  echo "  scripts/dns-records.sh 1.2.3.4          # plan only" >&2
  echo "  scripts/dns-records.sh --apply 1.2.3.4" >&2
  exit 2
fi

# A typo here points the domain at a stranger, so check the shape.
echo "$IP" | grep -qE '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || {
  echo "Not an IPv4 address: $IP" >&2; exit 2; }

if [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || { echo "No such env file: $ENV_FILE" >&2; exit 2; }
  value=$(grep -E '^NETLIFY_AUTH_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
  [ -n "$value" ] && export NETLIFY_AUTH_TOKEN="$value"
fi

# An encrypted value is not a missing one, and the API cannot tell you that —
# it just says unauthorized. The HQ apps keep secrets dotenv-encrypted with
# the private key in an ignored .env.keys; a raw grep returns ciphertext that
# looks exactly like a token. Hit this with the Porkbun keys already.
case "${NETLIFY_AUTH_TOKEN:-}" in
  encrypted:*|encr*)
    echo "NETLIFY_AUTH_TOKEN holds an ENCRYPTED value, not a usable token." >&2
    echo "Decrypt it in the project that owns it and export the plaintext." >&2
    exit 2 ;;
esac

if [ -z "${NETLIFY_AUTH_TOKEN:-}" ]; then
  echo "NETLIFY_AUTH_TOKEN must be set (export it, or pass --env-file)." >&2
  echo "  https://app.netlify.com/user/applications#personal-access-tokens" >&2
  exit 2
fi

API="https://api.netlify.com/api/v1"

get() {
  curl --silent --show-error --max-time 30 \
    --header "Authorization: Bearer $NETLIFY_AUTH_TOKEN" "$API/$1"
}

post() {
  # Body on stdin; the token stays in a header, never in argv.
  curl --silent --show-error --max-time 30 \
    --header "Authorization: Bearer $NETLIFY_AUTH_TOKEN" \
    --header 'Content-Type: application/json' \
    --data @- "$API/$1"
}

echo "== zone =="
ZONE_JSON=$(get dns_zones)
ZONE_ID=$(printf '%s' "$ZONE_JSON" | DOMAIN="$DOMAIN" python3 -c '
import json, os, sys
target = os.environ["DOMAIN"]
try:
    zones = json.load(sys.stdin)
except Exception:
    print("", end=""); raise SystemExit(0)
if isinstance(zones, dict):
    print("", end=""); raise SystemExit(0)
for z in zones:
    if z.get("name") == target:
        print(z.get("id", ""), end="")
        raise SystemExit(0)
print("", end="")
')

if [ -z "$ZONE_ID" ]; then
  echo "  No Netlify DNS zone for $DOMAIN under this token."
  echo "  The zone exists at the nameserver level, so the token probably"
  echo "  belongs to a different Netlify account than the one holding it."
  echo "  Check: dig +short $DOMAIN NS"
  exit 1
fi
echo "  found (id ${ZONE_ID})"

echo
echo "== records now =="
get "dns_zones/$ZONE_ID/dns_records" | python3 -c '
import json, sys
rows = json.load(sys.stdin)
if isinstance(rows, dict):
    print("  " + str(rows.get("message", rows))); raise SystemExit(0)
if not rows:
    print("  (none — the zone is empty)"); raise SystemExit(0)
for r in sorted(rows, key=lambda r: (r.get("type",""), r.get("hostname",""))):
    print("  " + str(r.get("type","")).ljust(6) + str(r.get("hostname","")).ljust(34)
          + str(r.get("value","")) + "  (ttl " + str(r.get("ttl","")) + ")")
'

echo
echo "== plan =="
echo "  A      $DOMAIN -> $IP   (ttl $TTL)   [apex is canonical]"
echo "  CNAME  www.$DOMAIN -> $DOMAIN  (ttl $TTL)"

if [ -z "$APPLY" ]; then
  echo
  echo "  Nothing written. Re-run with --apply to create them."
  exit 0
fi

create() {
  # $1 type, $2 hostname, $3 value
  printf '%s' "$(TYPE="$1" HOST="$2" VALUE="$3" TTL="$TTL" python3 -c '
import json, os, sys
sys.stdout.write(json.dumps({
    "type": os.environ["TYPE"],
    "hostname": os.environ["HOST"],
    "value": os.environ["VALUE"],
    "ttl": int(os.environ["TTL"]),
}))
')" | post "dns_zones/$ZONE_ID/dns_records" | TYPE="$1" HOST="$2" python3 -c '
import json, os, sys
kind, host = os.environ["TYPE"], os.environ["HOST"]
try:
    data = json.load(sys.stdin)
except Exception:
    print("  " + kind + " " + host + ": no JSON back"); raise SystemExit(0)
if isinstance(data, dict) and data.get("id"):
    print("  created " + kind + " " + host)
else:
    msg = data.get("message", data) if isinstance(data, dict) else data
    print("  FAILED " + kind + " " + host + ": " + str(msg))
'
}

echo
echo "== writing =="
create A "$DOMAIN" "$IP"
create CNAME "www.$DOMAIN" "$DOMAIN"

echo
echo "== verify (may lag by the TTL) =="
echo "  dig +short $DOMAIN A"
echo "  dig +short www.$DOMAIN"
echo "  curl -sI https://$DOMAIN | head -1"
echo
echo "  Then re-run the gate against a build made with APP_URL set:"
echo "    APP_URL=https://$DOMAIN bun run build && APP_URL=https://$DOMAIN bun gate.ts"
