FROM node:20-alpine

RUN apk add --no-cache ffmpeg bash coreutils findutils bc
RUN apk add --no-cache fontconfig ttf-dejavu
RUN apk add --no-cache ffmpeg font-noto fontconfig


WORKDIR /app

COPY server.js worker.js ./
COPY public ./public

RUN npm init -y && npm install express ws

EXPOSE 3000

CMD ["node", "server.js"]
