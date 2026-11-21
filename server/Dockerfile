# The Fight Forge API as one container. Build from the repository root:
#   docker build -f server/Dockerfile -t fight-forge-api .
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY server ./server
COPY src ./src
COPY content/default ./content/default
COPY tsconfig.json ./
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
VOLUME /data
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
