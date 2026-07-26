#!/bin/sh
set -e

echo "Running DB migrations..."
node /app/prisma-cli/node_modules/.bin/prisma migrate deploy

exec node server.js
