FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY shared ./shared
COPY contracts ./contracts
COPY browser-extension ./browser-extension
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
WORKDIR /app

COPY server/requirements/opentimestamps.txt /tmp/opentimestamps-requirements.txt
RUN apk add --no-cache python3 \
  && apk add --no-cache --virtual .ots-build gcc musl-dev python3-dev py3-pip \
  && python3 -m venv /opt/rollapp-ots \
  && /opt/rollapp-ots/bin/pip install --no-cache-dir -r /tmp/opentimestamps-requirements.txt \
  && apk del .ots-build

RUN apk add --no-cache caddy chromium ffmpeg su-exec tini xvfb-run \
  && addgroup -S -g 10001 retailer-renderer \
  && adduser -S -D -H -u 10001 -G retailer-renderer retailer-renderer \
  && mkdir -p /data /config

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/dist ./dist
COPY server ./server
RUN PYTHONDONTWRITEBYTECODE=1 /opt/rollapp-ots/bin/python server/reward-proof-codec-test.py
COPY shared ./shared
COPY contracts ./contracts
COPY certs ./certs
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443 8080

ENV RETAILER_CHROMIUM_PATH=/usr/bin/chromium-browser
ENV RETAILER_BROWSER_MODE=headful
ENV RETAILER_BROWSER_RUN_AS=10001:10001
ENV RETAILER_BROWSER_UID=10001
ENV RETAILER_BROWSER_GID=10001

CMD ["/sbin/tini", "-g", "--", "xvfb-run", "-a", "-s", "-screen 0 1280x1024x24 -nolisten tcp -ac", "node", "server/start.js"]
