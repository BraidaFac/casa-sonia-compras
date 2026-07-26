#!/bin/sh
set -e

echo "Running DB migrations..."
node /app/.prisma-cli/.bin/prisma migrate deploy

exec node server.js
