FROM linuxserver/ffmpeg:latest

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        bash \
        bc \
        findutils \
        fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*

COPY generate.sh /usr/local/bin/generate.sh
RUN chmod +x /usr/local/bin/generate.sh

ENTRYPOINT ["/usr/local/bin/generate.sh"]
