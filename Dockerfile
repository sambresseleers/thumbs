FROM linuxserver/ffmpeg:latest

WORKDIR /app

COPY backend ./backend
COPY public ./public

RUN cd backend && npm install

ENV NODE_ENV=production
ENV COLS=11
ENV ROWS=10
ENV WIDTH=3840
ENV HEIGHT=2160
ENV FONT_SIZE=30
ENV BORDER=4

VOLUME /data

CMD ["node", "backend/server.js"]
