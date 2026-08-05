FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

ENV BACKEND_URL=http://api:8000

COPY docker-entrypoint.d/05-require-linkmesh-api-key.sh /docker-entrypoint.d/05-require-linkmesh-api-key.sh
RUN chmod 755 /docker-entrypoint.d/05-require-linkmesh-api-key.sh
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
