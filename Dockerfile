FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec vp build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PREVIEW_HOST=0.0.0.0
COPY --from=build /app /app
EXPOSE 5181
CMD ["npx", "vp", "preview", "--port", "5181", "--strictPort"]
