FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache python3 make g++ openssl && \
    npm install --legacy-peer-deps

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="mysql://user:pass@localhost:3306/dummy" pnpm prisma generate
RUN DATABASE_URL="mysql://user:pass@localhost:3306/dummy" pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3006
ENV PORT=3006
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
