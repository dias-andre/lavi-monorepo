#!/usr/bin/env bash
set -euo pipefail

echo "Starting Laví demo with Docker Compose"
exec docker compose up --build "$@"
