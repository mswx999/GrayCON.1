/**
 * GrayCON — build.js
 *
 * What this does:
 *  1. Loads env vars (from .env.local locally, or Vercel env in production)
 *  2. Reads app.js and replaces __ENV_PLACEHOLDER__ tokens with real values
 *  3. Copies all files to /dist — Vercel serves from there
 *
 * Run:  node build.js
 */

const fs   = require('fs');
const path = require('path');

/* Load .env.local for local development.
   On Vercel, process.env already has the vars injected — dotenv is skipped. */
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  /* dotenv not installed yet — that's fine on first run */
}

/* ── Validate all required env vars are present ── */
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = REQUIRED.filter(k => !process.env[k] || process.env[k].startsWith('YOUR_'));
if (missing.length > 0) {
  console.error('\n❌ Missing environment variables:');
  missing.forEach(k => console.error('   •', k));
  console.error('\n→ For local dev:  copy .env to .env.local and fill in real values');
  console.error('→ For Vercel:     add them in Dashboard → Settings → Environment Variables\n');
  process.exit(1);
}

/* ── Create /dist directory ── */
const DIST = path.join(__dirname, 'dist');
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

/* ── Copy static files as-is ── */
const STATIC_FILES = ['index.html', 'style.css'];
STATIC_FILES.forEach(file => {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, file));
    console.log(`✓ Copied  ${file}`);
  } else {
    console.warn(`⚠ Missing ${file} — skipped`);
  }
});

/* ── Process app.js — inject env vars ── */
const appSrc = path.join(__dirname, 'app.js');
if (!fs.existsSync(appSrc)) {
  console.error('❌ app.js not found');
  process.exit(1);
}

let appJs = fs.readFileSync(appSrc, 'utf8');

const replacements = {
  '__ENV_FIREBASE_API_KEY__':            process.env.VITE_FIREBASE_API_KEY,
  '__ENV_FIREBASE_AUTH_DOMAIN__':        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  '__ENV_FIREBASE_PROJECT_ID__':         process.env.VITE_FIREBASE_PROJECT_ID,
  '__ENV_FIREBASE_STORAGE_BUCKET__':     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  '__ENV_FIREBASE_MESSAGING_SENDER_ID__':process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  '__ENV_FIREBASE_APP_ID__':             process.env.VITE_FIREBASE_APP_ID,
};

Object.entries(replacements).forEach(([placeholder, value]) => {
  appJs = appJs.split(placeholder).join(value);
});

fs.writeFileSync(path.join(DIST, 'app.js'), appJs);
console.log('✓ Built   app.js (env vars injected)');

console.log('\n✅ Build complete → /dist ready for Vercel\n');
