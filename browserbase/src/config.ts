/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { devices, type BrowserContextOptions, type LaunchOptions } from 'playwright';
import { sanitizeForFilePath } from './tools/utils.js'; // Assuming this path is correct

// Define ToolCapability type
export type ToolCapability = 'core' | 'vision' | string; // Example capabilities

// Define simpler intermediate types
export type LaunchOptionsWithExtras = LaunchOptions & { 
  assistantMode?: boolean; 
  webSocketPort?: number; 
  channel?: string; // Ensure channel is part of it
};
export type BrowserConfig = {
  browserName?: 'chromium' | 'firefox' | 'webkit';
  userDataDir?: string;
  launchOptions?: LaunchOptionsWithExtras;
  contextOptions?: BrowserContextOptions;
  cdpEndpoint?: string;
};

// Define the main Config interface using BrowserConfig
export interface Config {
  browserbaseApiKey?: string; // Make optional for easier merging
  browserbaseProjectId?: string; // Make optional for easier merging
  browser?: BrowserConfig;
  server?: {
    port?: number;
    host?: string;
  };
  capabilities?: ToolCapability[];
  vision?: boolean;
  outputDir?: string;
  // Tool-specific configurations
  tools?: {
    [toolName: string]: any; // Allow arbitrary tool-specific config
    browser_take_screenshot?: {
        omitBase64?: boolean;
    };
  };
}

// Define Command Line Options Structure
export type CLIOptions = {
  browser?: string;
  capabilities?: string; // Renamed from 'caps'
  cdpEndpoint?: string;
  executablePath?: string;
  headless?: boolean;
  device?: string;
  userDataDir?: string;
  port?: number;
  host?: string;
  vision?: boolean;
  config?: string; // Path to config file
};

// Default Configuration Values
const defaultConfig: Config = {
  browser: {
    browserName: 'chromium',
    userDataDir: os.tmpdir(),
    launchOptions: {
      channel: 'chrome',
      headless: os.platform() === 'linux' && !process.env.DISPLAY,
      assistantMode: true, // Default assistantMode
    },
    contextOptions: {
      viewport: null,
    },
  },
};

// Resolve final configuration by merging defaults, file config, and CLI options
export async function resolveConfig(cliOptions: CLIOptions): Promise<Config> {
  const fileConfig = await loadConfig(cliOptions.config);
  const cliConfig = await configFromCLIOptions(cliOptions);
  // Order: Defaults < File Config < CLI Overrides
  const mergedConfig = mergeConfig(defaultConfig, mergeConfig(fileConfig, cliConfig));

  // --- Add Browserbase Env Vars ---
  // Ensure env vars are read *after* dotenv potentially runs (in index.ts)
  mergedConfig.browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
  mergedConfig.browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
  // --------------------------------

  // Basic validation for Browserbase keys
  if (!mergedConfig.browserbaseApiKey) {
    console.warn("Warning: BROWSERBASE_API_KEY environment variable not set.");
  }
  if (!mergedConfig.browserbaseProjectId) {
      console.warn("Warning: BROWSERBASE_PROJECT_ID environment variable not set.");
  }

  return mergedConfig;
}

// Create Config structure based on CLI options
export async function configFromCLIOptions(cliOptions: CLIOptions): Promise<Config> {
  let browserName: 'chromium' | 'firefox' | 'webkit' = 'chromium'; // Default
  let channel: string | undefined = 'chrome'; // Default channel for chromium

  switch (cliOptions.browser) {
    case 'chrome':
    case 'chrome-beta':
    case 'chrome-canary':
    case 'chrome-dev':
    case 'chromium':
    case 'msedge':
    case 'msedge-beta':
    case 'msedge-canary':
    case 'msedge-dev':
      browserName = 'chromium';
      channel = cliOptions.browser;
      break;
    case 'firefox':
      browserName = 'firefox';
      channel = undefined; // Firefox doesn't use channel
      break;
    case 'webkit':
      browserName = 'webkit';
      channel = undefined; // Webkit doesn't use channel
      break;
    // Keep default if browser option is invalid or missing
  }

  // Use the specific LaunchOptionsWithExtras type here
  const launchOptions: LaunchOptionsWithExtras = {
    channel: browserName === 'chromium' ? channel : undefined,
    executablePath: cliOptions.executablePath,
    headless: cliOptions.headless,
    assistantMode: true, // Ensure assistantMode is included
  };

  // Add WebSocket port only for Chromium as needed by assistantMode
  if (browserName === 'chromium') {
    (launchOptions as any).webSocketPort = await findFreePort();
  }

  // Use the standard BrowserContextOptions type here
  const contextOptions: BrowserContextOptions | undefined = cliOptions.device ? devices[cliOptions.device] : undefined;

  // Initialize browser config structure first using BrowserConfig type
  const browserConfig: BrowserConfig = {
    browserName,
    userDataDir: cliOptions.userDataDir ?? await createUserDataDir({ browserName, channel }),
    launchOptions: undefined, // Initialize as undefined
    contextOptions: undefined, // Initialize as undefined
    cdpEndpoint: cliOptions.cdpEndpoint,
  };

  // Assign potentially undefined options
  browserConfig.launchOptions = launchOptions;
  browserConfig.contextOptions = contextOptions;

  return {
    browser: browserConfig, // Use the structured object
    server: {
      port: cliOptions.port,
      host: cliOptions.host,
    },
    // Use renamed cliOptions.capabilities
    capabilities: cliOptions.capabilities?.split(',').map((c: string) => c.trim() as ToolCapability),
    vision: !!cliOptions.vision,
  };
}

// Utility function to find a free network port
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref(); // Prevent server from keeping Node.js process open
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'string' ? parseInt(address.split(':')[1], 10) : address?.port;
      server.close(() => {
          if (port) {
              resolve(port);
          } else {
              reject(new Error('Unable to retrieve port from server address.'));
          }
      });
    });
  });
}

// Load configuration from a JSON file
async function loadConfig(configFile: string | undefined): Promise<Config> {
  if (!configFile) {
    return {}; // Return empty config if no file path provided
  }

  try {
    const configContent = await fs.promises.readFile(configFile, 'utf8');
    return JSON.parse(configContent);
  } catch (error: any) {
    // Handle file not found gracefully, but throw for other errors
    if (error.code === 'ENOENT') {
        console.warn(`Config file not found: ${configFile}. Using defaults and CLI options.`);
        return {};
    }
    throw new Error(`Failed to load or parse config file: ${configFile}, ${error}`);
  }
}

// Create a user data directory for the browser session
async function createUserDataDir(options: { browserName: string, channel: string | undefined }): Promise<string> {
  let cacheDirectory: string;
  if (process.platform === 'linux')
    cacheDirectory = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  else if (process.platform === 'darwin')
    cacheDirectory = path.join(os.homedir(), 'Library', 'Caches');
  else if (process.platform === 'win32')
    cacheDirectory = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  else
    throw new Error('Unsupported platform: ' + process.platform);

  const profileDirName = sanitizeForFilePath(`mcp-${options.channel ?? options.browserName}-profile`);
  const result = path.join(cacheDirectory, 'ms-playwright', profileDirName);
  await fs.promises.mkdir(result, { recursive: true });
  return result;
}

// Create an output file path within the configured output directory
export async function outputFile(config: Config, name: string): Promise<string> {
  const outputDir = config.outputDir ?? os.tmpdir();
  await fs.promises.mkdir(outputDir, { recursive: true });
  const sanitizedName = sanitizeForFilePath(name);
  return path.join(outputDir, sanitizedName);
}

// Helper function to merge config objects, excluding undefined values
function pickDefined<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

// Merge two configuration objects (overrides takes precedence)
function mergeConfig(base: Config, overrides: Config): Config {
  // Use the simpler BrowserConfig type for merging browser options
  const browserLaunchOptions: LaunchOptionsWithExtras = {
    ...pickDefined(base.browser?.launchOptions),
    ...pickDefined(overrides.browser?.launchOptions),
    assistantMode: true, // Always ensure assistantMode is true
  };

  // Remove channel if browser is not chromium
  if (overrides.browser?.browserName && overrides.browser.browserName !== 'chromium') {
    delete browserLaunchOptions.channel;
  }

  // Use the simpler BrowserConfig type for merging browser options
  const browser: BrowserConfig = {
    ...pickDefined(base.browser),
    ...pickDefined(overrides.browser),
    launchOptions: browserLaunchOptions,
    contextOptions: {
      ...pickDefined(base.browser?.contextOptions),
      ...pickDefined(overrides.browser?.contextOptions),
    },
  };

  // Merge tools config carefully
  const tools = {
      ...pickDefined(base.tools),
      ...pickDefined(overrides.tools),
      // Specific tool config merge if needed, e.g.:
      // browser_take_screenshot: {
      //     ...pickDefined(base.tools?.browser_take_screenshot),
      //     ...pickDefined(overrides.tools?.browser_take_screenshot),
      // }
  };

  return {
    ...pickDefined(base),
    ...pickDefined(overrides),
    browser,
    tools,
  };
} 