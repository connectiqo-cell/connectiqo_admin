# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# .env must exist in the build context (see .env.example) — Vite bakes
# VITE_* values into the bundle at build time, not at container runtime.
COPY . .
RUN npm run build

# ---- Serve stage ----
# Plain static file server — the VPS's own Caddy (outside this container)
# handles the domain/TLS and reverse-proxies to this container's port 3003.
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist

EXPOSE 3003
CMD ["serve", "-s", "dist", "-l", "3003"]
