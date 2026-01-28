FROM node:18

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash

RUN apt-get install -y redis-server

RUN mkdir -p /zk-server
RUN mkdir -p /zk-server/build
RUN mkdir -p /zk-server/zokrates
RUN mkdir -p /zk-server/zokrates/stdlib
WORKDIR /zk-server

COPY build /zk-server/build/
#COPY ./configs/serverSetupConfig.json /zk-server/
COPY ./configs /zk-server/
COPY ./src/test/zokrates/stdlib /zk-server/zokrates/stdlib

EXPOSE 6379
EXPOSE 3000
EXPOSE 3001

ENTRYPOINT ["node", "build/index.js"]