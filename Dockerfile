FROM node:20-bookworm

# Install FFmpeg only (no VAAPI)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json and install deps
COPY backend/package.json ./
RUN npm install --omit=dev

# Copy rest of backend and public
COPY backend ./backend
COPY public ./public

EXPOSE 3000
VOLUME /data

CMD ["node", "backend/server.js"]
