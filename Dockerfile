# Stage 1: Install deps
# npm used (not pnpm) — flat node_modules (copyable) + no build-script restrictions
# so @prisma/engines downloads its linux-musl binary via postinstall
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache python3 make g++ && \
    npm install --legacy-peer-deps

# Stage 2: Build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client (DATABASE_URL dummy, no DB connection at build time)
RUN DATABASE_URL="mysql://user:pass@localhost:3306/dummy" pnpm prisma generate
RUN DATABASE_URL="mysql://user:pass@localhost:3306/dummy" pnpm build

# Stage 3: Runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma: migrations + config files
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Prisma CLI + engines needed for migrate deploy at runtime
# Note: generated client is in prisma/generated/client (custom output), already copied above
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Entrypoint: run migrations then start app
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3006
ENV PORT=3006
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
