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

## How to setup in MCP json

```json
   {
      "mcpServers": {
         "playwright": {
            "url": "http://localhost:8931/sse",
            "args" : ["--proxies"],
            "env": {
               "BROWSERBASE_API_KEY": "",
               "BROWSERBASE_PROJECT_ID": ""
            }
         }
      }
   }
```

## Local Dev

To run locally we can self-host over SSE. 

```bash
   node cli.js --port 8931
```

From here you should be able to put the url as "http://localhost:8931/sse" in the config.json

You can also pass in the optional flags for proxies and context id that are shown in [`config.d.ts`](./config.d.ts).
____

## Flags & Example Configs

### Proxies

Here are our docs on [Proxies](https://docs.browserbase.com/features/proxies).



### Contexts

Here are our docs on [Contexts](https://docs.browserbase.com/features/contexts)


### Cookie Injection

Why would you need to inject cookies? Our context API currently works on persistent cookies, but not session cookies. So sometimes our persistent auth might not work (we're working hard to add this functionality). 

You can flag cookies into the MCP by adding 



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

## Contexts for Persistence

This server supports Browserbase's Contexts feature, which allows persisting cookies, authentication, and cached data across browser sessions:

1. **Creating a Context**:
   ```
   browserbase_context_create: Creates a new context, optionally with a friendly name
   ```

2. **Using a Context with a Session**:
   ```
   browserbase_session_create: Now accepts a 'context' parameter with:
     - id: The context ID to use
     - name: Alternative to ID, the friendly name of the context
     - persist: Whether to save changes (cookies, cache) back to the context (default: true)
   ```

3. **Deleting a Context**:
   ```
   browserbase_context_delete: Deletes a context when you no longer need it
   ```

Contexts make it much easier to:
- Maintain login state across sessions
- Reduce page load times by preserving cache
- Avoid CAPTCHAs and detection by reusing browser fingerprints

## Cookie Management

This server also provides direct cookie management capabilities:

1. **Adding Cookies**:
   ```
   browserbase_cookies_add: Add cookies to the current browser session with full control over properties
   ```

2. **Getting Cookies**:
   ```
   browserbase_cookies_get: View all cookies in the current session (optionally filtered by URLs)
   ```

3. **Deleting Cookies**:
   ```
   browserbase_cookies_delete: Delete specific cookies or clear all cookies from the session
   ```

These tools are useful for:
- Setting authentication cookies without navigating to login pages
- Backing up and restoring cookie state
- Debugging cookie-related issues
- Manipulating cookie attributes (expiration, security flags, etc.)

## TODO

*   Implement true `ref`-based interaction logic for click, type, drag, hover, select_option.
*   Implement element-specific screenshots using `ref`.
*   Add more standard Playwright MCP tools (tabs, navigation, etc.).
*   Add tests.
