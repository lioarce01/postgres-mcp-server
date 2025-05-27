FROM node:22.12-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm ci

RUN npx tsc

FROM node:22.12-alpine AS release

# Establecer entorno de producción
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts

ENTRYPOINT ["node", "dist/index.js"]
