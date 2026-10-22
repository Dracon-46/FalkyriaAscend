# Ascend — imagem de produção (API + interface servida pela API).
FROM node:25-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:25-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3333 HOST=0.0.0.0 WEB_DIST_DIR=/app/web MIGRATIONS_DIR=/app/api/drizzle
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/packages/engine/package.json packages/engine/
COPY --from=build /app/packages/contracts/package.json packages/contracts/
COPY --from=build /app/apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @rpg/api --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/apps/api/dist api/dist
COPY --from=build /app/apps/api/drizzle api/drizzle
COPY --from=build /app/apps/web/dist web
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3333)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "api/dist/src/server.js"]
