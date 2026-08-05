#!/bin/sh
set -eu

if [ -z "${LINKMESH_API_KEY:-}" ]; then
    echo >&2 "linkmesh-dashboard: LINKMESH_API_KEY must be set before nginx starts."
    exit 1
fi

# envsubst replaces every ${VAR} present in the environment. An unset
# LINKMESH_SERVER_NAMES would leave a literal "${LINKMESH_SERVER_NAMES}" in
# server_name and break nginx -t. Empty is valid: localhost and 127.0.0.1 alone.
: "${LINKMESH_SERVER_NAMES=}"
export LINKMESH_SERVER_NAMES
