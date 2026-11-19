FROM node:24-bookworm-slim
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --fund=false
COPY --chown=node:node agent ./agent
RUN npm run build
ENV NODE_ENV=production
CMD ["./node_modules/.bin/eve", "start", "--host", "127.0.0.1"]
