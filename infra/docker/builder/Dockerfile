FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates clamav openssl poppler-utils tesseract-ocr tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /workspace
RUN chown node:node /workspace
COPY --chown=node:node . .
USER node
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @neo/prisma db:generate
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "--filter", "@neo/builder", "start"]
