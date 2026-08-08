# Build stage
FROM node:22-alpine AS builder

ARG VIGIL_API_KEY
ARG VIGIL_API_BASE_URL
ENV VIGIL_API_KEY=$VIGIL_API_KEY
ENV VIGIL_API_BASE_URL=$VIGIL_API_BASE_URL

WORKDIR /app

RUN apk add --no-cache python3 py3-pip

COPY package*.json ./
RUN npm ci

COPY requirements-seo.txt ./
RUN python3 -m pip install --no-cache-dir -r requirements-seo.txt

COPY . .
# `npm run build` runs scripts/generate_seo.py via prebuild, which regenerates the
# manifest + sitemap and fails the build on any SEO payload warning.
RUN npm run build
RUN python3 -m seoslug validate-html \
      dist/index.html dist/projects/index.html \
      dist/en/index.html dist/en/projects/index.html dist/en/404/index.html \
      dist/es/index.html dist/es/projects/index.html dist/es/404/index.html \
      dist/fr/index.html dist/fr/projects/index.html dist/fr/404/index.html \
      --strict


# Runtime stage
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
