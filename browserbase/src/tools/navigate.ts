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

import { z } from 'zod';
import { defineTool, type ToolFactory } from './tool.js';
import type { ToolActionResult } from '../context.js';

const navigate: ToolFactory = captureSnapshot => defineTool({
  capability: 'core',

  schema: {
    name: 'browser_navigate',
    description: 'Navigate to a URL',
    inputSchema: z.object({
      url: z.string().describe('The URL to navigate to'),
    }),
  },

  handle: async (context, params) => {
    const page = await context.getActivePage();
    if (!page) {
      throw new Error('No active page found for navigate');
    }
    const action = async (): Promise<ToolActionResult> => {
      await page.goto(params.url);
      return { content: [{ type: 'text', text: `Navigated to ${params.url}` }] };
    };

    const code = [
      `// Navigate to ${params.url}`,
      `await page.goto('${params.url}');`,
    ];

    return {
      action,
      code,
      captureSnapshot,
      waitForNetwork: false,
    };
  },
});

const goBack: ToolFactory = captureSnapshot => defineTool({
  capability: 'history',
  schema: {
    name: 'browserbase_navigate_back',
    description: 'Go back to the previous page',
    inputSchema: z.object({}),
  },

  handle: async context => {
    const page = await context.getActivePage();
    if (!page) {
      throw new Error('No active page found for goBack');
    }
    const action = async (): Promise<ToolActionResult> => {
      await page.goBack();
      return { content: [{ type: 'text', text: 'Navigated back' }] };
    };
    const code = [
      `// Navigate back`,
      `await page.goBack();`,
    ];

    return {
      action,
      code,
      captureSnapshot,
      waitForNetwork: true,
    };
  },
});

const goForward: ToolFactory = captureSnapshot => defineTool({
  capability: 'history',
  schema: {
    name: 'browserbase_navigate_forward',
    description: 'Go forward to the next page',
    inputSchema: z.object({}),
  },
  handle: async context => {
    const page = await context.getActivePage();
    if (!page) {
      throw new Error('No active page found for goForward');
    }
    const action = async (): Promise<ToolActionResult> => {
      await page.goForward();
      return { content: [{ type: 'text', text: 'Navigated forward' }] };
    };
    const code = [
      `// Navigate forward`,
      `await page.goForward();`,
    ];
    return {
      action,
      code,
      captureSnapshot,
      waitForNetwork: true,
    };
  },
});

const captureSnapshotValue = true;

export default [
  navigate(captureSnapshotValue),
  goBack(captureSnapshotValue),
  goForward(captureSnapshotValue),
]; 