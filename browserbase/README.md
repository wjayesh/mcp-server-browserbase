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

The server communicates over stdio according to the Model Context Protocol.

## Structure

*   `src/`: TypeScript source code
    *   `index.ts`: Main entry point, env checks, shutdown
    *   `server.ts`: MCP Server setup and request routing
    *   `sessionManager.ts`: Handles Browserbase session creation/management
    *   `tools/`: Tool definitions and implementations
    *   `resources/`: Resource (screenshot) handling
    *   `types.ts`: Shared TypeScript types
*   `dist/`: Compiled JavaScript output
*   `tests/`: Placeholder for tests
*   `utils/`: Placeholder for utility scripts
*   `Dockerfile`: For building a Docker image
*   Configuration files (`.json`, `.ts`, `.mjs`, `.npmignore`)

## TODO

*   Implement true `ref`-based interaction logic for click, type, drag, hover, select_option.
*   Implement element-specific screenshots using `ref`.
*   Add more standard Playwright MCP tools (tabs, navigation, etc.).
*   Add tests.
