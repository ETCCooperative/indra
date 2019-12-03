ARG SOLC_VERSION
FROM ethereum/solc:$SOLC_VERSION-alpine as solc
FROM node:12.13.0-alpine3.9
WORKDIR /root
ENV HOME /root
RUN apk add --update --no-cache bash curl g++ gcc git jq make python
RUN npm config set unsafe-perm true
RUN npm install -g lerna npm@6.12.0
COPY --from=solc /usr/local/bin/solc /usr/local/bin/solc
COPY ops /ops
ENV PATH="./node_modules/.bin:${PATH}"
ENTRYPOINT ["bash", "/ops/permissions-fixer.sh"]
