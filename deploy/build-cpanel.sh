#!/usr/bin/env bash
# Builds the site for the domain root (bbegypt.com) and stages it, with the cPanel
# deployment file, in ./cpanel-out — the content of the "cpanel" branch.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist cpanel-out
BASE_PATH=/ npx vite build
mkdir -p cpanel-out
cp -R dist/. cpanel-out/
cp deploy/.cpanel.yml deploy/.htaccess cpanel-out/
