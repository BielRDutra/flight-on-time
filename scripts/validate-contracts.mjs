import SwaggerParser from '@apidevtools/swagger-parser';
import { resolve } from 'node:path';

const CONTRACT_FILES = [
  'specs/001-flight-activity-monitor/contracts/openapi.yaml',
  'specs/002-personalized-flight-alerts/contracts/personalization-api.yaml',
];

async function validateContracts() {
  for (const relativePath of CONTRACT_FILES) {
    const absolutePath = resolve(relativePath);
    const api = await SwaggerParser.validate(absolutePath);
    console.info(`Validated ${relativePath}: ${api.info.title} (${api.info.version})`);
  }
}

validateContracts().catch((error) => {
  console.error('Contract validation failed:', error);
  process.exitCode = 1;
});
