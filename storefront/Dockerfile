FROM node:24-alpine AS base

FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY ./.npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm i --frozen-lockfile --prefer-offline

COPY     ./global.d.ts     ./knip.config.ts     ./next.config.js     ./paper-version.json     ./postcss.config.cjs     ./tailwind.config.cjs     ./tsconfig.json     ./.graphqlrc.ts     ./
COPY ./messages ./messages/
COPY ./public ./public/
COPY ./src ./src/

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_SALEOR_API_URL
ENV NEXT_PUBLIC_SALEOR_API_URL=${NEXT_PUBLIC_SALEOR_API_URL}

# Server-side data fetching during next build must use an API address reachable
# from the build network. This is intentionally separate from the public URL
# baked into browser bundles.
ARG SALEOR_INTERNAL_API_URL
ENV SALEOR_INTERNAL_API_URL=${SALEOR_INTERNAL_API_URL}

ARG NEXT_PUBLIC_STOREFRONT_URL
ENV NEXT_PUBLIC_STOREFRONT_URL=${NEXT_PUBLIC_STOREFRONT_URL}

ARG NEXT_PUBLIC_CHECKOUT_URL
ENV NEXT_PUBLIC_CHECKOUT_URL=${NEXT_PUBLIC_CHECKOUT_URL}

ARG NEXT_PUBLIC_DEFAULT_CHANNEL
ENV NEXT_PUBLIC_DEFAULT_CHANNEL=${NEXT_PUBLIC_DEFAULT_CHANNEL:-default-channel}

# NEXT_PUBLIC_ values are compiled into the browser bundle during the image build;
# they must match the runtime allowlist, picker, SSR and locale/channel routes.
ARG STOREFRONT_CHANNELS
ENV STOREFRONT_CHANNELS=${STOREFRONT_CHANNELS}

ARG NEXT_PUBLIC_DEFAULT_LOCALE
ENV NEXT_PUBLIC_DEFAULT_LOCALE=${NEXT_PUBLIC_DEFAULT_LOCALE:-en}

ARG NEXT_PUBLIC_STOREFRONT_LOCALES
ENV NEXT_PUBLIC_STOREFRONT_LOCALES=${NEXT_PUBLIC_STOREFRONT_LOCALES:-en}

ARG NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS
ENV NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS=${NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS}

ARG NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS
ENV NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS=${NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS:-false}

ARG NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT
ENV NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT=${NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT:-false}

# Use checked-in generated GraphQL artifacts during an image build.
# Running the package "build" script would trigger prebuild -> generate:all and
# require a live Saleor API before the first backend container exists.
RUN NEXT_OUTPUT=standalone pnpm exec next build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ARG NEXT_PUBLIC_SALEOR_API_URL
ENV NEXT_PUBLIC_SALEOR_API_URL=${NEXT_PUBLIC_SALEOR_API_URL}

ARG NEXT_PUBLIC_STOREFRONT_URL
ENV NEXT_PUBLIC_STOREFRONT_URL=${NEXT_PUBLIC_STOREFRONT_URL}

ARG NEXT_PUBLIC_CHECKOUT_URL
ENV NEXT_PUBLIC_CHECKOUT_URL=${NEXT_PUBLIC_CHECKOUT_URL}

ARG NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS
ENV ENABLE_STRIPE_PAYMENTS=${NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS:-false}

ARG NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT
ENV NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT=${NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT:-false}

EXPOSE 3000
CMD ["node", "server.js"]
