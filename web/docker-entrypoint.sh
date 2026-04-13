#!/bin/sh
set -e

: "${PUBLIC_URL:?PUBLIC_URL environment variable is required (e.g. https://atbbs.app)}"

# Strip trailing slash.
PUBLIC_URL="${PUBLIC_URL%/}"

SCOPE="atproto blob:*/* repo:xyz.atboards.site repo:xyz.atboards.board repo:xyz.atboards.news repo:xyz.atboards.thread repo:xyz.atboards.reply repo:xyz.atboards.ban repo:xyz.atboards.hide repo:xyz.atboards.pin"

# Runtime config read by the SPA at startup.
cat > /usr/share/nginx/html/config.json <<EOF
{
  "client_id": "${PUBLIC_URL}/client-metadata.json",
  "redirect_uri": "${PUBLIC_URL}/oauth/callback",
  "scope": "${SCOPE}"
}
EOF

# OAuth client metadata — fetched cross-origin by atproto auth servers.
cat > /usr/share/nginx/html/client-metadata.json <<EOF
{
  "client_id": "${PUBLIC_URL}/client-metadata.json",
  "client_name": "atbbs",
  "client_uri": "${PUBLIC_URL}",
  "redirect_uris": ["${PUBLIC_URL}/oauth/callback"],
  "scope": "${SCOPE}",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "web",
  "dpop_bound_access_tokens": true
}
EOF

exec nginx -g 'daemon off;'
