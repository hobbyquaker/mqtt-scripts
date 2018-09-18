FROM arm32v7/node:slim

COPY . /node

RUN cd /node && \
	npm install

ENTRYPOINT [ "node", "/node/index.js" ]
