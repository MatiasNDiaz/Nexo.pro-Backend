# syntax=docker/dockerfile:1

# 1) Dependencias completas (incluye las de build y test)
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) Compilación y poda de dependencias de desarrollo
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# 3) Imagen final: solo dist + dependencias de producción, usuario no root
FROM node:26-slim AS runtime
ENV NODE_ENV=production
# Puerto del contenedor. La app lo lee de PORT; el valor por defecto del código también es 3001.
ENV PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Carpeta del adaptador de archivos local (solo desarrollo con docker compose; en producción los
# archivos van a Cloudinary y la validación del entorno prohíbe el disco).
RUN mkdir -p /app/.uploads && chown node:node /app/.uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/main.js"]
