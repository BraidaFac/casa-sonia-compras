#!/bin/sh
set -e

echo "Running DB migrations..."
node node_modules/.bin/prisma migrate deploy

exec node server.js
