FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
WORKDIR /app

RUN apk add --no-cache caddy \
  && mkdir -p /data /config

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY certs ./certs
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443 8080

CMD ["node", "server/start.js"]
