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

RUN python3 -m pip install --no-cache-dir seoslug==2.3.0

COPY . .
RUN python3 scripts/generate_seo.py
RUN npm run build
RUN python3 -m seoslug validate-html dist/index.html dist/projects/index.html dist/404.html --strict


# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
