FROM node:lts-alpine as base

WORKDIR /usr/src/app

COPY package-lock.json package.json ./
# RUN npm install --loglevel verbose
COPY node_modules/ node_modules/

COPY jest.integration.config.js tsconfig.json ./
COPY src/ src/
COPY tests/ tests/

CMD ["watch", "-n1", "echo run tests in this container"]
