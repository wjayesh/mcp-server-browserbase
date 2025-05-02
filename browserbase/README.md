# Playwright Browserbase MCP Server

A Model Context Protocol server that uses Playwright and Browserbase
to provide browser automation tools.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Set environment variables (e.g., in a `.env` file):
    *   `BROWSERBASE_API_KEY`: Your Browserbase API key.
    *   `BROWSERBASE_PROJECT_ID`: Your Browserbase project ID.
3.  Compile TypeScript:
    ```bash
    npm run build
    ```

## Running

```bash
node dist/index.js
```
