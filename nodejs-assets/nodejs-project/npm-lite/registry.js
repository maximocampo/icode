'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

const REGISTRY = 'https://registry.npmjs.org';
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30000;

/**
 * Fetch full package metadata (packument) from the registry.
 */
async function fetchPackument(packageName) {
  const encoded = packageName.startsWith('@')
    ? '@' + encodeURIComponent(packageName.slice(1))
    : encodeURIComponent(packageName);
  return httpGetJson(`${REGISTRY}/${encoded}`);
}

/**
 * Download a tarball as a Buffer.
 */
async function downloadTarball(tarballUrl) {
  return httpGetBuffer(tarballUrl);
}

function httpGetJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) return reject(new Error(`Too many redirects: ${url}`));

    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'npm-lite/0.1.0' },
      timeout: TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGetJson(res.headers.location, redirects + 1));
      }
      if (res.statusCode === 404) {
        res.resume();
        return reject(new Error(`Package not found: ${url}`));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`Bad JSON from ${url}: ${e.message}`)); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function httpGetBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) return reject(new Error(`Too many redirects: ${url}`));

    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, {
      headers: { 'User-Agent': 'npm-lite/0.1.0' },
      timeout: TIMEOUT_MS * 2,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGetBuffer(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout downloading: ${url}`)); });
  });
}

module.exports = { fetchPackument, downloadTarball };
