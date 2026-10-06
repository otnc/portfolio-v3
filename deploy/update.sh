#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="$(git rev-parse --show-toplevel)"
TARGET_DIR="${TARGET_DIR:-/opt/marron-portfolio}"
SERVICE="${SERVICE:-marron-portfolio}"

if [[ "$SOURCE_DIR" == "$TARGET_DIR" ]]; then
	echo "SOURCE_DIR and TARGET_DIR must be different" >&2
	exit 1
fi

command -v rsync >/dev/null || {
	echo "rsync is required" >&2
	exit 1
}

id marron >/dev/null 2>&1 || {
	echo "The marron service user is required" >&2
	exit 1
}

echo "Syncing $SOURCE_DIR -> $TARGET_DIR"
sudo mkdir -p "$TARGET_DIR"
sudo rsync -a --delete \
	--exclude='.git/' \
	--exclude='.env' \
	--exclude='.astro/' \
	--exclude='dist/' \
	--exclude='node_modules/' \
	--exclude='server/cache/' \
	--exclude='server/data/' \
	"$SOURCE_DIR/" "$TARGET_DIR/"

sudo chown -R marron:marron "$TARGET_DIR"

cd "$TARGET_DIR"
sudo -u marron pnpm install --frozen-lockfile
sudo -u marron pnpm --filter marron-portfolio-server build
sudo systemctl restart "$SERVICE"

sudo -u marron pnpm build
sudo systemctl restart "$SERVICE"

echo "Deployment completed"
