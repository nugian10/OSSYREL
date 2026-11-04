#!/usr/bin/env node
/**
 * OSSYREL — THE HASH LEDGER collection generator.
 * Pure Node.js, zero external dependencies, deterministic (seed "OSSYREL").
 * Generates 5,000 unique geometric SVG node artworks + 5,000 metadata JSONs.
 *
 * Usage:
 *   node scripts/generate-collection.js            # generate all files
 *   node scripts/generate-collection.js --verify   # verify existing files
 *   node scripts/generate-collection.js --clean    # delete generated files
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEED = 'OSSYREL';
const MAX_SUPPLY = 5000;
const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'collection', 'images');
const META_DIR = path.join(ROOT, 'collection', 'metadata');

// Class ranges (tokenId inclusive) and per-class attributes.
const CLASSES = [
  { name: 'STARTER', min: 1,    max: 500,  hashRate: 10,   shares: 1,   tier: 0,
    palette: { bg: '#0b0d10', metal: '#8a929c', accent: '#5c6670', glow: '#aab4be', line: '#3a4148' } },
  { name: 'BRONZE',  min: 501,  max: 2000, hashRate: 100,  shares: 10,  tier: 1,
    palette: { bg: '#171009', metal: '#b87333', accent: '#e0a458', glow: '#f0c078', line: '#5a3a1a' } },
  { name: 'SILVER',  min: 2001, max: 3500, hashRate: 250,  shares: 25,  tier: 2,
    palette: { bg: '#0d0f12', metal: '#c0c8d0', accent: '#e8eef4', glow: '#ffffff', line: '#454e58' } },
  { name: 'GOLD',    min: 3501, max: 4500, hashRate: 500,  shares: 50,  tier: 3,
    palette: { bg: '#171204', metal: '#d4af37', accent: '#f5d76e', glow: '#ffe98a', line: '#6b5518' } },
  { name: 'DIAMOND', min: 4501, max: 5000, hashRate: 1500, shares: 150, tier: 4,
    palette: { bg: '#04141a', metal: '#7fe7ff', accent: '#ffffff', glow: '#b8f4ff', line: '#145060' } },
];

function classFor(tokenId) {
  for (const c of CLASSES) if (tokenId >= c.min && tokenId <= c.max) return c;
  throw new Error('tokenId out of range: ' + tokenId);
}

// --- Deterministic PRNG: SHA-256(seed + ':' + tokenId) -> mulberry32 stream ---
function rngFor(tokenId) {
  const digest = crypto.createHash('sha256').update(SEED + ':' + tokenId).digest();
  let s = digest.readUInt32BE(0) >>> 0;
  // mulberry32
  function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

const rnd = (rng, min, max) => min + rng.next() * (max - min);
const f = (n) => Math.round(n); // integers only — keeps SVG compact

// Hexagon points around (cx,cy) radius r, rotated by `rot` degrees.
function hexPoints(cx, cy, r, rot) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = ((rot + i * 60) * Math.PI) / 180;
    pts.push(f(cx + r * Math.cos(a)) + ',' + f(cy + r * Math.sin(a)));
  }
  return pts.join(' ');
}

function generateSVG(tokenId) {
  const cls = classFor(tokenId);
  const p = cls.palette;
  const rng = rngFor(tokenId);
  const cx = 200, cy = 200;

  const parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">');
  parts.push('<rect width="400" height="400" fill="' + p.bg + '"/>');

  // --- deterministic circuit grid (background) ---
  const gridN = rng.int(1, 2);
  for (let i = 0; i < gridN; i++) {
    const horizontal = rng.next() < 0.5;
    const pos = rng.int(20, 380);
    const dash = rng.next() < 0.5 ? ' stroke-dasharray="4 6"' : '';
    if (horizontal) {
      parts.push('<line x1="0" y1="' + pos + '" x2="400" y2="' + pos + '" stroke="' + p.line + '"' + dash + '/>');
    } else {
      parts.push('<line x1="' + pos + '" y1="0" x2="' + pos + '" y2="400" stroke="' + p.line + '"' + dash + '/>');
    }
  }

  // --- orbit rings (2-3, radii + dash vary) ---
  const rings = rng.int(2, 3);
  for (let i = 0; i < rings; i++) {
    const r = rng.int(55, 175);
    const dash = rng.next() < 0.6 ? ' stroke-dasharray="' + rng.int(2, 14) + ' ' + rng.int(3, 12) + '"' : '';
    const w = rng.next() < 0.25 ? ' stroke-width="1.5"' : '';
    parts.push('<circle cx="200" cy="200" r="' + r + '" fill="none" stroke="' + p.line + '"' + w + dash + '/>');
  }

  // --- satellite nodes on orbits, linked to hub ---
  const nodeCount = rng.int(3, 4) + cls.tier; // higher tiers: more nodes
  const hubR = rng.int(26, 40);
  const rot0 = rng.int(0, 359);
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    const ang = ((rot0 + (360 / nodeCount) * i + rng.int(-14, 14)) * Math.PI) / 180;
    const dist = rng.int(hubR + 45, 168);
    const x = f(cx + dist * Math.cos(ang));
    const y = f(cy + dist * Math.sin(ang));
    const nr = rng.int(4, 11);
    nodes.push({ x, y, nr });
    // link line hub -> node
    const lw = rng.next() < 0.3 ? ' stroke-width="2"' : '';
    parts.push('<line x1="200" y1="200" x2="' + x + '" y2="' + y + '" stroke="' + p.metal + '"' + lw + ' opacity=".7"/>');
  }
  // inter-node links (circuit feel)
  const linkN = rng.int(1, 2);
  for (let i = 0; i < linkN; i++) {
    const a = nodes[rng.int(0, nodes.length - 1)];
    const b = nodes[rng.int(0, nodes.length - 1)];
    if (a !== b) {
      parts.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + p.line + '" opacity=".6"/>');
    }
  }
  // draw nodes: mix of circles and hexagons (one element each)
  for (const n of nodes) {
    if (rng.next() < 0.45) {
      parts.push('<polygon points="' + hexPoints(n.x, n.y, n.nr + 2, rng.int(0, 59)) + '" fill="' + p.bg + '" stroke="' + p.accent + '" stroke-width="1.5"/>');
    } else {
      parts.push('<circle cx="' + n.x + '" cy="' + n.y + '" r="' + n.nr + '" fill="' + p.metal + '" stroke="' + p.accent + '" stroke-width="1.5"/>');
    }
  }

  // --- central hub: hexagon + core + tier ring ---
  const hubRot = rng.int(0, 59);
  parts.push('<polygon points="' + hexPoints(cx, cy, hubR + 14, hubRot) + '" fill="none" stroke="' + p.metal + '" stroke-width="2"/>');
  parts.push('<polygon points="' + hexPoints(cx, cy, hubR, hubRot + 30) + '" fill="' + p.metal + '" opacity="0.9"/>');
  parts.push('<circle cx="200" cy="200" r="' + f(hubR * 0.45) + '" fill="' + p.bg + '"/>');
  parts.push('<circle cx="200" cy="200" r="' + f(hubR * 0.28) + '" fill="' + p.glow + '"/>');
  // tier marker: extra ring(s) for higher classes (max 3 rings)
  for (let t = 0; t < Math.min(cls.tier, 3); t++) {
    parts.push('<circle cx="200" cy="200" r="' + (hubR + 22 + t * 7) + '" fill="none" stroke="' + p.accent + '" opacity=".5"/>');
  }
  // diamond sparkle: small 4-point crosses (two strokes, compact)
  if (cls.name === 'DIAMOND') {
    for (let i = 0; i < 2; i++) {
      const a = ((rng.int(0, 359)) * Math.PI) / 180;
      const d = rng.int(60, 150);
      const x = f(cx + d * Math.cos(a)), y = f(cy + d * Math.sin(a));
      const s = rng.int(5, 9);
      parts.push('<path d="M' + x + ' ' + (y - s) + 'V' + (y + s) + 'M' + (x - s) + ' ' + y + 'H' + (x + s) + '" stroke="' + p.glow + '" stroke-width="1.5"/>');
    }
  }

  // --- corner accent: small hex + token label (also guarantees uniqueness) ---
  parts.push('<polygon points="' + hexPoints(28, 28, 10, rng.int(0, 59)) + '" fill="none" stroke="' + p.accent + '" stroke-width="1.5"/>');
  parts.push('<text x="14" y="388" font-size="11" fill="' + p.metal + '">#' + tokenId + ' ' + cls.name + '</text>');

  parts.push('</svg>');
  return parts.join('');
}

function generateMetadata(tokenId) {
  const cls = classFor(tokenId);
  return {
    name: 'OSSYREL #' + tokenId + ' — ' + cls.name + ' Node',
    description:
      'A ' + cls.name.toLowerCase() + ' node of THE HASH LEDGER. ' +
      'This abstract digital node mines ' + cls.hashRate + ' MH/s and holds ' + cls.shares +
      ' share' + (cls.shares > 1 ? 's' : '') + ' of the OSSYREL network, earning OSR tokens in Era 1. ' +
      'Geometric node art, generated deterministically on BNB Chain (chain ID 56).',
    image: '../images/' + tokenId + '.svg',
    tokenId,
    attributes: [
      { trait_type: 'Class', value: cls.name },
      { trait_type: 'Hash Rate (MH/s)', value: cls.hashRate },
      { trait_type: 'Shares', value: cls.shares },
      { trait_type: 'Era', value: 1 },
      { trait_type: 'Token ID', value: tokenId },
    ],
  };
}

function generate() {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  fs.mkdirSync(META_DIR, { recursive: true });
  let maxSvg = 0, totalSvg = 0, totalJson = 0;
  for (let id = 1; id <= MAX_SUPPLY; id++) {
    const svg = generateSVG(id);
    const svgPath = path.join(IMG_DIR, id + '.svg');
    fs.writeFileSync(svgPath, svg);
    maxSvg = Math.max(maxSvg, Buffer.byteLength(svg));
    totalSvg += Buffer.byteLength(svg);
    const meta = JSON.stringify(generateMetadata(id), null, 2) + '\n';
    fs.writeFileSync(path.join(META_DIR, id + '.json'), meta);
    totalJson += Buffer.byteLength(meta);
    if (id % 1000 === 0) console.log('  ... ' + id + ' / ' + MAX_SUPPLY);
  }
  console.log('Done. SVG total: ' + (totalSvg / 1024).toFixed(1) + ' KB (max single: ' + maxSvg + ' B)');
  console.log('      JSON total: ' + (totalJson / 1024).toFixed(1) + ' KB');
}

function verify() {
  const errors = [];
  const perClass = {};
  for (const c of CLASSES) perClass[c.name] = { ok: 0, fail: 0 };

  const svgFiles = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR).filter((f) => f.endsWith('.svg')) : [];
  const jsonFiles = fs.existsSync(META_DIR) ? fs.readdirSync(META_DIR).filter((f) => f.endsWith('.json')) : [];
  console.log('SVG files : ' + svgFiles.length + ' (expected 5000)');
  console.log('JSON files: ' + jsonFiles.length + ' (expected 5000)');
  if (svgFiles.length !== 5000) errors.push('SVG count ' + svgFiles.length + ' != 5000');
  if (jsonFiles.length !== 5000) errors.push('JSON count ' + jsonFiles.length + ' != 5000');

  // uniqueness of SVG content
  const hashes = new Set();
  let maxSvg = 0, over3k = 0;
  for (const f of svgFiles) {
    const buf = fs.readFileSync(path.join(IMG_DIR, f));
    maxSvg = Math.max(maxSvg, buf.length);
    if (buf.length >= 3072) over3k++;
    hashes.add(crypto.createHash('sha256').update(buf).digest('hex'));
  }
  console.log('Unique SVG content hashes: ' + hashes.size + ' / ' + svgFiles.length +
    ' (duplicates: ' + (svgFiles.length - hashes.size) + ')');
  console.log('Max SVG size: ' + maxSvg + ' B; files >= 3 KB: ' + over3k);
  if (hashes.size !== svgFiles.length) errors.push('duplicate SVG content: ' + (svgFiles.length - hashes.size));
  if (over3k > 0) errors.push(over3k + ' SVG files >= 3 KB');

  // metadata checks
  const seenIds = new Set();
  for (const f of jsonFiles) {
    const id = parseInt(f.replace('.json', ''), 10);
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(META_DIR, f), 'utf8'));
    } catch (e) {
      errors.push(f + ': invalid JSON');
      continue;
    }
    seenIds.add(id);
    const cls = classFor(id);
    const bucket = perClass[cls.name];
    const fail = (msg) => { errors.push('#' + id + ': ' + msg); bucket.fail++; };
    let ok = true;
    if (meta.tokenId !== id) { fail('tokenId field ' + meta.tokenId + ' != ' + id); ok = false; }
    const attr = {};
    for (const a of meta.attributes || []) attr[a.trait_type] = a.value;
    if (attr['Class'] !== cls.name) { fail('Class ' + attr['Class'] + ' != ' + cls.name); ok = false; }
    if (attr['Hash Rate (MH/s)'] !== cls.hashRate) { fail('Hash Rate ' + attr['Hash Rate (MH/s)'] + ' != ' + cls.hashRate); ok = false; }
    if (attr['Shares'] !== cls.shares) { fail('Shares ' + attr['Shares'] + ' != ' + cls.shares); ok = false; }
    if (attr['Era'] !== 1) { fail('Era ' + attr['Era'] + ' != 1'); ok = false; }
    if (attr['Token ID'] !== id) { fail('Token ID attr ' + attr['Token ID'] + ' != ' + id); ok = false; }
    if (meta.name !== 'OSSYREL #' + id + ' — ' + cls.name + ' Node') { fail('name mismatch'); ok = false; }
    const imgPath = path.join(META_DIR, meta.image || '');
    if (!meta.image || !fs.existsSync(imgPath)) { fail('image path missing: ' + meta.image); ok = false; }
    if (ok) bucket.ok++;
  }
  const missing = [];
  for (let id = 1; id <= MAX_SUPPLY; id++) if (!seenIds.has(id)) missing.push(id);
  console.log('Token IDs present: ' + seenIds.size + ' / 5000; missing: ' + (missing.length ? missing.slice(0, 10).join(',') + (missing.length > 10 ? '...' : '') : 'none'));
  if (missing.length) errors.push('missing tokenIds: ' + missing.length);

  console.log('\nPer-class attribute check:');
  for (const c of CLASSES) {
    const b = perClass[c.name];
    console.log('  ' + c.name.padEnd(8) + ' #' + c.min + '-' + c.max + '  OK ' + b.ok + ' / FAIL ' + b.fail);
  }

  if (errors.length === 0) {
    console.log('\nVERIFY: PASS — all checks passed.');
  } else {
    console.log('\nVERIFY: FAIL — ' + errors.length + ' error(s). First 20:');
    errors.slice(0, 20).forEach((e) => console.log('  - ' + e));
    process.exitCode = 1;
  }
}

function clean() {
  for (const d of [IMG_DIR, META_DIR]) {
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
  }
  console.log('Cleaned generated files.');
}

const arg = process.argv[2];
if (arg === '--verify') verify();
else if (arg === '--clean') clean();
else generate();
