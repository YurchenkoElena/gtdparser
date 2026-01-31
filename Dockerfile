FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --ignore-engines

COPY . .
RUN yarn build

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

RUN mkdir -p /tmp/gtdparser

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]

