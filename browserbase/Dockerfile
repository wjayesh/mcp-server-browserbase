# Basic Node.js Dockerfile
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY browserbase/package.json browserbase/package-lock.json ./
RUN npm ci --only=production

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY browserbase/ .

# Build the TypeScript source code
RUN npm run build

# Create the final image from a smaller Node.js runtime
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy built files from the builder stage
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# Define environment variables (can be overridden)
ENV NODE_ENV=production
ENV BROWSERBASE_API_KEY=<YOUR_BROWSERBASE_API_KEY>
ENV BROWSERBASE_PROJECT_ID=<YOUR_BROWSERBASE_PROJECT_ID>

# Expose a default port (useful if deploying as a service) 8931 is standard for sse mcp
EXPOSE 8931

CMD [ "node", "cli.js" ] 