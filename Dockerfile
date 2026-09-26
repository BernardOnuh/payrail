# Builds the Payrail API. Deploy root should be this repo (builder = DOCKERFILE).
# The web app is deployed separately on Vercel (see README).

FROM node:22-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/package.json api/package.json
COPY contracts/package.json contracts/package.json
COPY scripts/package.json scripts/package.json
COPY mcp/package.json mcp/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile

COPY api api
RUN pnpm --filter @payrail/api build \
  && rm -f api/dist/*.map

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api ./api
EXPOSE 3033
CMD ["node", "api/dist/main.js"]