#!/bin/sh
set -e

echo "Running Prisma migrations..."
NODE_PATH=/tmp/node_modules node /tmp/node_modules/prisma/build/index.js migrate deploy

echo "Starting Next.js..."
exec node server.js
