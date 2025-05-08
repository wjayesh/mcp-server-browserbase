# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies including dev dependencies for building
# --ignore-scripts prevents the prepare script from running prematurely
RUN npm ci --ignore-scripts

# Copy all source files
COPY . .

# Build the TypeScript source code manually instead of using the npm script
RUN npx tsc && npx shx chmod +x dist/*.js 2>/dev/null || echo "No executable JS files found"

# Production stage
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
# --ignore-scripts prevents the prepare script from running
RUN npm ci --omit=dev --ignore-scripts

# Copy built files from builder stage
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/cli.js /app/cli.js
COPY --from=builder /app/index.js /app/index.js
COPY --from=builder /app/index.d.ts /app/index.d.ts
COPY --from=builder /app/config.d.ts /app/config.d.ts

# Define environment variables (will be provided by Smithery)
ENV NODE_ENV=production

# Expose a default port (useful if deploying as a service)
EXPOSE 8931

# Command to run the application
CMD [ "node", "cli.js", "--port", "8931" ] 