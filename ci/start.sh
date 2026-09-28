#!/usr/bin/env bash
set -euo pipefail

echo "Starting Laví demo with Podman Compose"
exec podman-compose up --build "$@"
