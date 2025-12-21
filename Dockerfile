FROM linuxserver/ffmpeg:latest

RUN apk add --no-cache bash bc findutils

COPY generate.sh /usr/local/bin/generate.sh
RUN chmod +x /usr/local/bin/generate.sh

ENTRYPOINT ["/usr/local/bin/generate.sh"]
