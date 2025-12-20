FROM node:20-bookworm

# ---- Install FFmpeg + VAAPI ----
RUN apt-get update && apt-get install -y \
    ffmpeg \
    vainfo \
    intel-media-va-driver-non-free \
    i965-va-driver \
    libva-drm2 \
    libva-x11-2 \
    && rm -rf /var/lib/apt/lists/*

ENV LIBVA_DRIVER_NAME=iHD
ENV NODE_ENV=production

WORKDIR /app

# ---- Backend ----
COPY backend ./backend
RUN cd backend && npm install --omit=dev

# ---- Frontend ----
COPY public ./public

# ---- Data volumes ----
VOLUME /data

# ---- Defaults (override in docker-compose) ----
ENV COLS=11
ENV ROWS=10
ENV WIDTH=3840
ENV HEIGHT=2160
ENV FONT_SIZE=30
ENV BORDER=4

EXPOSE 3000

CMD ["node", "backend/server.js"]
