#!/usr/bin/env bash
# Netlify production build for marten.money.
#
# With a production deploy key, deploy the Convex backend first and build the
# site against it, so both ship together. Any other key would point the public
# site at the wrong backend (a development key targets a personal dev
# deployment), so without a production key only the site is built, against the
# VITE_CONVEX_URL set in Netlify. The key's value is never printed.
set -euo pipefail

case "${CONVEX_DEPLOY_KEY:-}" in
  prod:*)
    exec npx convex deploy \
      --cmd "npm run build" \
      --cmd-url-env-var-name VITE_CONVEX_URL
    ;;
  "")
    echo "WARNING: CONVEX_DEPLOY_KEY is not set; building the site without deploying the backend." >&2
    ;;
  *)
    echo "WARNING: CONVEX_DEPLOY_KEY is not a production deploy key; building the site without deploying the backend." >&2
    ;;
esac

exec npm run build
