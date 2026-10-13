ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
ARG NGINX_IMAGE=nginx:stable-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94
FROM ${NODE_IMAGE} AS builder
RUN apk --no-cache add bash
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
ENV CI=1
RUN pnpm install --frozen-lockfile

COPY nginx/ nginx/
COPY assets/ assets/
COPY locale/ locale/
COPY scripts/ scripts/
COPY vite.config.js ./
COPY tsconfig.json ./
COPY codegen-main.ts ./
COPY graphql.config.ts ./
COPY *.d.ts ./
COPY schema-main.graphql ./
COPY .featureFlags/ .featureFlags/

COPY src/ src/

ARG API_URL
ARG COMMERCE_OPS_URL
ARG APP_MOUNT_URI
ARG EXTENSIONS_API_URL
ARG STATIC_URL
ARG SKIP_SOURCEMAPS
ARG LOCALE_CODE

ENV API_URL="${API_URL:-http://localhost:8000/graphql/}"
ENV COMMERCE_OPS_URL="${COMMERCE_OPS_URL:-}"
ENV APP_MOUNT_URI="${APP_MOUNT_URI:-/dashboard/}"
ENV EXTENSIONS_API_URL="${EXTENSIONS_API_URL}"
ENV STATIC_URL="${STATIC_URL:-/dashboard/}"
ENV SKIP_SOURCEMAPS="${SKIP_SOURCEMAPS:-true}"
ENV LOCALE_CODE="${LOCALE_CODE:-EN}"
RUN pnpm run generate:main
RUN pnpm exec cross-env NODE_OPTIONS=--max-old-space-size=8192 vite build

FROM ${NGINX_IMAGE} AS runner
WORKDIR /app

ARG COMMIT_ID
ARG PROJECT_VERSION

COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
COPY ./nginx/replace-env-vars.sh /docker-entrypoint.d/50-replace-env-vars.sh
COPY --from=builder /app/build/ /app/

LABEL \
  org.opencontainers.image.title="saleor/saleor-dashboard" \
  org.opencontainers.image.description="A GraphQL-powered, single-page dashboard application for Saleor." \
  org.opencontainers.image.url="https://saleor.io/" \
  org.opencontainers.image.source="https://github.com/saleor/saleor-dashboard" \
  org.opencontainers.image.revision="$COMMIT_ID" \
  org.opencontainers.image.version="$PROJECT_VERSION" \
  org.opencontainers.image.authors="Saleor Commerce (https://saleor.io)" \
  org.opencontainers.image.licenses="BSD 3"
