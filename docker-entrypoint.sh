#!/bin/sh
set -e

echo "Running DB migrations..."
NODE_PATH=/app/prisma-cli/node_modules node /app/prisma-cli/node_modules/.bin/prisma migrate deploy

exec node server.js
