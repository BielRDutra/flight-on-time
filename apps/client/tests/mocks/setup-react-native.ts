import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as reactNativeMock from './react-native.js';

Object.assign(globalThis, {
  expect,
  afterEach,
  beforeAll,
  afterAll,
});

const require = createRequire(import.meta.url);
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const reactNativeEntry = resolve(currentDirectory, '../../node_modules/react-native/index.js');

require.cache[reactNativeEntry] = {
  id: reactNativeEntry,
  filename: reactNativeEntry,
  loaded: true,
  exports: reactNativeMock,
} as unknown as NodeJS.Module;
