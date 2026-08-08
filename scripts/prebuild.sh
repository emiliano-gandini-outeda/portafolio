#!/usr/bin/env sh
# Runs before `astro build` (see package.json "prebuild").
#
#   1. copies the i18n JSON into public/ so the client-side language switcher can fetch it
#   2. regenerates the SEO manifest + sitemap with seoslug
#
# Step 2 needs Python + seoslug. That is guaranteed inside the Dockerfile, but NOT on a
# generic CI host (Cloudflare Pages installs npm deps only). So: try to make seoslug
# available, and if we cannot, fall back to the committed manifest/sitemap instead of
# failing the deploy. Both artifacts are tracked in git precisely so this fallback is safe.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p public/i18n
cp src/i18n/*.json public/i18n/

if [ "${SKIP_SEO_GEN:-}" = "1" ]; then
  echo "prebuild: SKIP_SEO_GEN=1, using committed SEO artifacts."
  exit 0
fi

PY="${PYTHON:-python3}"

if ! command -v "$PY" >/dev/null 2>&1; then
  echo "prebuild: no $PY on PATH; using committed SEO artifacts."
  exit 0
fi

has_seoslug() {
  "$PY" -c 'import seoslug' >/dev/null 2>&1
}

if ! has_seoslug; then
  echo "prebuild: seoslug not installed, attempting install..."
  # PEP 668 environments reject a plain install; --user and --break-system-packages
  # cover the two common escapes. Failure here is not fatal.
  "$PY" -m pip install --quiet --disable-pip-version-check -r requirements-seo.txt >/dev/null 2>&1 \
    || "$PY" -m pip install --quiet --disable-pip-version-check --user -r requirements-seo.txt >/dev/null 2>&1 \
    || "$PY" -m pip install --quiet --disable-pip-version-check --break-system-packages -r requirements-seo.txt >/dev/null 2>&1 \
    || true
fi

if has_seoslug; then
  exec "$PY" scripts/generate_seo.py
fi

# Last resort: the committed manifest + sitemap must exist, or there is nothing to ship.
missing=""
[ -f src/data/seo-manifest.json ] || missing="$missing src/data/seo-manifest.json"
[ -f public/sitemap.xml ] || missing="$missing public/sitemap.xml"
if [ -n "$missing" ]; then
  echo "prebuild: seoslug unavailable and no committed SEO artifacts ($missing)." >&2
  exit 1
fi

echo "prebuild: seoslug unavailable; using committed SEO artifacts (run 'npm run seo' locally to refresh)."
