FROM node:18

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash

RUN apt-get install -y redis-server

RUN mkdir -p /zk-server
RUN mkdir -p /zk-server/build
WORKDIR /zk-server

COPY build /zk-server/build/
COPY ./serverSetupConfig.json /zk-server/

#RUN npm install --only=production

ENTRYPOINT ["node", "build/index.js"]