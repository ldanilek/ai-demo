#!/usr/bin/env bash
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "Running production Convex deploy + build..."
  npx convex deploy --cmd "npm run build"
  exit 0
fi

preview_source="${VERCEL_GIT_COMMIT_REF:-${VERCEL_BRANCH_URL:-}}"
preview_name="$(printf '%s' "${preview_source}" | tr '/' '-' | tr -cs '[:alnum:]-' '-' | sed 's/^-*//; s/-*$//' | cut -c1-40)"
if [[ -z "${preview_name}" ]]; then
  fallback_uuid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)"
  preview_name="vercel-${fallback_uuid}"
fi

export PREVIEW_NAME="${preview_name}"

echo "Running preview Convex setup for PREVIEW_NAME=${PREVIEW_NAME}..."
npx convex dev --preview-name "${PREVIEW_NAME}" --once
node scripts/setup-preview-auth.mjs
npm run build
