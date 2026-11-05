FROM node:22-bookworm-slim AS frontend-build
WORKDIR /workspace
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -- --configLoader runner

FROM ghcr.io/railwayapp/function-bun:1.4.4
WORKDIR /app
COPY api/server.js /app/server.js
COPY --from=frontend-build /workspace/dist /app/dist
CMD ["bun", "run", "/app/server.js"]
