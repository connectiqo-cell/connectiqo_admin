# Connectiqo email worker — sends emails queued in Supabase's email_outbox table.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

# Run as the image's unprivileged user.
USER node

CMD ["node", "src/index.js"]
