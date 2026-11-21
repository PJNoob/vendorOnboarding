FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates clamav openssl poppler-utils tesseract-ocr tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /workspace
RUN chown node:node /workspace
USER node
# Installing from the manifests alone keeps the dependency layer cached across source-only changes.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/builder/package.json apps/builder/
COPY --chown=node:node packages/env/package.json packages/env/
COPY --chown=node:node packages/prisma/package.json packages/prisma/
COPY --chown=node:node packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
RUN CI=true pnpm install --offline --frozen-lockfile
RUN pnpm --filter @neo/prisma db:generate
RUN pnpm build
# Last, so the daily signature refresh does not invalidate the cached dependency and build layers.
USER root
# Seed for the worker's /tmp/clamav; a new SIGNATURE_DATE value rebuilds this layer, and pods refresh signatures at runtime.
ARG SIGNATURE_DATE=unset
RUN mkdir /opt/clamav-seed && chown clamav:clamav /opt/clamav-seed && freshclam --datadir=/opt/clamav-seed && chmod -R a+rX /opt/clamav-seed
# The worker runs as node and logs to stdout; the distro log path is root-owned.
RUN sed -i '/^UpdateLogFile /d' /etc/clamav/freshclam.conf
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@neo/builder", "start"]
