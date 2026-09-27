FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production

# Cloud Run injects PORT at runtime; index.js already reads process.env.PORT.
EXPOSE 8080

CMD ["node", "src/index.js"]
