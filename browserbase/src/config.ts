import os from 'os';
import fs from 'fs';
import path from 'path';
import { sanitizeForFilePath } from './tools/utils.js'; // Assuming this path is correct

export type ToolCapability = 'core' | string; // Example capabilities

export interface Config {
  browserbaseApiKey?: string; // Make optional for easier merging
  browserbaseProjectId?: string; // Make optional for easier merging
  server?: {
    port?: number;
    host?: string;
  };
  proxies?: boolean;
  contextId?: string;
}

// Define Command Line Options Structure
export type CLIOptions = {
  proxies?: boolean;
  contextId?: string;
  port?: number;
  host?: string;
};

// Default Configuration Values
const defaultConfig: Config = {
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID,
  proxies: false,
  contextId: undefined,
};

// Resolve final configuration by merging defaults, file config, and CLI options
export async function resolveConfig(cliOptions: CLIOptions): Promise<Config> {
  const cliConfig = await configFromCLIOptions(cliOptions);
  // Order: Defaults < File Config < CLI Overrides
  const mergedConfig = mergeConfig(defaultConfig, cliConfig);

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
 return {
    server: {
      port: cliOptions.port,
      host: cliOptions.host,
    },
    proxies: cliOptions.proxies || false,
    contextId: cliOptions.contextId || undefined,
  };
}

// Create an output file path within the configured output directory
export async function outputFile(config: Config, name: string): Promise<string> {
  const outputDir = os.tmpdir();
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
  return {
    ...pickDefined(base),
    ...pickDefined(overrides),
  };
} 