# Basic Node.js Dockerfile
FROM node:20-slim

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY dist ./dist
COPY src ./src

# Define environment variables (can be overridden)
ENV NODE_ENV=production
# ENV BROWSERBASE_API_KEY=your_api_key
# ENV BROWSERBASE_PROJECT_ID=your_project_id

# Expose a default port (useful if deploying as a service, though stdio is used now)
EXPOSE 8080

CMD [ "node", "dist/index.js" ] 