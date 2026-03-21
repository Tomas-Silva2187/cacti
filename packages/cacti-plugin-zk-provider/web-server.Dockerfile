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
COPY ./src/test/zokrates/proveSquare.zok /zk-server/zokrates/proveSquare.zok
COPY ./src/test/zokrates/proveSignature.zok /zk-server/zokrates/proveSignature.zok
COPY ./src/test/zokrates/concatHash.zok /zk-server/zokrates/concatHash.zok

EXPOSE 12801
EXPOSE 12802
EXPOSE 12803
EXPOSE 12804
EXPOSE 12805

ENTRYPOINT ["node", "build/index.js"]
CMD []