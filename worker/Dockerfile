FROM docker.io/oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --production

COPY . .

ENV NODE_ENV=production

CMD ["bun", "start"]
