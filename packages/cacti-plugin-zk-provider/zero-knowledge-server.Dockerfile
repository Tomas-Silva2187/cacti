FROM node:18

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash

RUN apt-get update && apt-get install -y --no-install-recommends \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/dockerd /usr/local/bin/dockerd