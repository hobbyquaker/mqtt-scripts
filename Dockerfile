FROM node:slim

COPY . /node

RUN cd /node && \
	npm install

ENTRYPOINT [ "node", "/node/index.js" ]
