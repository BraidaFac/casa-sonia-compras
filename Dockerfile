FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm install --legacy-peer-deps

COPY . .
RUN DATABASE_URL="mysql://user:pass@localhost:3306/dummy" npx prisma generate
RUN DATABASE_URL="mysql://user:pass@localhost:3306/dummy" npm run build

# Dedicated stage: install prisma CLI + engines for migrate deploy
FROM node:22-alpine AS migration
WORKDIR /migration
RUN apk add --no-cache openssl
COPY --from=builder /app/package.json ./
RUN npm install --no-audit --no-fund prisma

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3006

RUN apk add --no-cache openssl

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# Prisma CLI isolated from standalone node_modules
COPY --from=migration /migration/node_modules /app/.prisma-cli

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3006

ENTRYPOINT ["./docker-entrypoint.sh"]
