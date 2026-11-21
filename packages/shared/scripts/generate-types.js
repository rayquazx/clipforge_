/**
 * Script to fetch /openapi.json from FastAPI backend and update packages/shared.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:8000/openapi.json';
const OUTPUT_FILE = path.resolve(__dirname, '../openapi.json');

console.log(`Fetching OpenAPI schema from ${API_URL}...`);

http.get(API_URL, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed to fetch schema. HTTP status: ${res.statusCode}`);
    process.exit(1);
  }

  let rawData = '';
  res.on('data', (chunk) => { rawData += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(rawData);
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(parsed, null, 2), 'utf8');
      console.log(`Saved OpenAPI schema to ${OUTPUT_FILE}`);
    } catch (e) {
      console.error('Error parsing JSON:', e);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error(`Error connecting to ${API_URL}:`, err.message);
  console.log('Ensure the FastAPI backend is running (e.g. uvicorn app.main:app --port 8000).');
});
