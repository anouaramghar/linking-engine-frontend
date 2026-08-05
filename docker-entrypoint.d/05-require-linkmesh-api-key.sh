#!/bin/sh
set -eu

if [ -z "${LINKMESH_API_KEY:-}" ]; then
    echo >&2 "linkmesh-dashboard: LINKMESH_API_KEY must be set before nginx starts."
    exit 1
fi
