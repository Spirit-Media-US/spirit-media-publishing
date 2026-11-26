#!/bin/bash
# with-build-lock.sh — run the site build under THE SAME per-repo lock the deploy tools take
# (deploy-live.sh / git-push-deploy / deploy-preview.sh: <git-dir>/fhb-build.lock).
# WHY (builder 2026-11-26, queue 15a9f176): the deploy tools lock, but a seat running `npm run build`
# straight in /srv/sites/spirit-media-publishing does not — dist/ was rebuilt by a hand build at 22:27Z,
# and the 21:12Z production run built 201 pages, then found "no sitemap-N.xml in dist" seconds later and
# uploaded nothing (INFERRED: a concurrent build in the same tree). Now every build takes the lock:
# a caller that already holds it (FHB_BUILD_LOCK_HELD=1, exported by the deploy tools) runs straight
# through; anyone else WAITS (up to 30 min) instead of wiping dist/ under a production build.
set -euo pipefail
if [ "${FHB_BUILD_LOCK_HELD:-}" = "1" ]; then exec "$@"; fi
LOCK="$(git rev-parse --absolute-git-dir)/fhb-build.lock"
[ -e "$LOCK" ] || { : >"$LOCK"; chmod 666 "$LOCK" 2>/dev/null || true; }
exec 9>>"$LOCK"
if ! flock -n 9; then
  echo "⏳ build lock held ($(cat "$LOCK.owner" 2>/dev/null || echo unknown)) — waiting (≤30 min) so this build cannot wipe dist/ under it…" >&2
  flock -w "${FHB_BUILD_LOCK_WAIT:-1800}" 9 || { echo "❌ build lock still held after ${FHB_BUILD_LOCK_WAIT:-1800}s — not building." >&2; exit 1; }
fi
echo "npm-build pid $$ $(id -un) $(date -u +%FT%TZ)" >"$LOCK.owner" 2>/dev/null || true
export FHB_BUILD_LOCK_HELD=1
"$@"
