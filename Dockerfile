FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build
EXPOSE 3000
CMD ["sh", "-c", "npm run db:push && npm run start"]
