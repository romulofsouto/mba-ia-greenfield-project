#!/bin/sh
# Dev launcher for the video worker (compose `video-worker` service).
#
# `node --watch` must end up as the main process: unlike `nest start --watch`,
# it forwards SIGTERM to the worker and waits for it to exit, so
# `docker compose stop` runs the Nest shutdown hooks (closing the BullMQ
# workers) and the container exits with the worker's exit code.
set -e

TSC=./node_modules/.bin/tsc

# Fresh build first, so node starts on complete output.
rm -rf dist-worker
"$TSC" -p tsconfig.worker.json

# Recompile on edit; node --watch restarts the worker when dist-worker changes.
"$TSC" -p tsconfig.worker.json --watch --preserveWatchOutput &

exec node --watch dist-worker/worker/main.js
