FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV HOST=0.0.0.0 PORT=4174 DATA_DIR=/app/.data/falkordb
VOLUME ["/app/.data"]
EXPOSE 4174
CMD ["npm","start"]
