FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    ffmpeg \
    vainfo \
    intel-media-va-driver \
    libva-drm2 \
    libva-x11-2 \
    && rm -rf /var/lib/apt/lists/*

ENV LIBVA_DRIVER_NAME=iHD
ENV NODE_ENV=production

WORKDIR /app

COPY backend/package.json ./
COPY backend ./backend
COPY public ./public
COPY package.json ./

RUN npm install --omit=dev

ENV COLS=11
ENV ROWS=10
ENV WIDTH=3840
ENV HEIGHT=2160
ENV FONT_SIZE=30
ENV BORDER=4

VOLUME /data
EXPOSE 3000

CMD ["node", "backend/server.js"]
