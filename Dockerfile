FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY shared ./shared
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
WORKDIR /app

RUN apk add --no-cache caddy chromium su-exec tini xvfb-run \
  && addgroup -S -g 10001 retailer-renderer \
  && adduser -S -D -H -u 10001 -G retailer-renderer retailer-renderer \
  && mkdir -p /data /config

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY certs ./certs
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443 8080

ENV RETAILER_CHROMIUM_PATH=/usr/bin/chromium-browser
ENV RETAILER_BROWSER_MODE=headful
ENV RETAILER_BROWSER_RUN_AS=10001:10001
ENV RETAILER_BROWSER_UID=10001
ENV RETAILER_BROWSER_GID=10001

CMD ["/sbin/tini", "-g", "--", "xvfb-run", "-a", "-s", "-screen 0 1280x1024x24 -nolisten tcp -ac", "node", "server/start.js"]
