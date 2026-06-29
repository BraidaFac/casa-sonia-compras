#!/bin/sh
set -e

echo "Running DB migrations..."
./node_modules/.bin/prisma migrate deploy

exec node_modules/.bin/next start
