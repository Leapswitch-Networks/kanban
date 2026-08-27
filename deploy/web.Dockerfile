# Build the Vite frontend, then serve it with nginx.
# Build context is the repo root (see docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty API base => frontend calls same-origin "/api/..." which nginx proxies.
ENV VITE_API_URL=""
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
