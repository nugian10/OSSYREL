/* OSSYREL — THE HASH LEDGER
   Shared front-end logic. All data here is DEMO / simulation data.
   No contract is deployed, no wallet is connected, no transaction
   is ever sent. One central spec object keeps every page consistent. */

"use strict";

const OSSYREL = {
  name: "OSSYREL",
  collection: "THE HASH LEDGER",
  tagline: "A New Era of Digital Nodes",
  chain: { name: "BNB Chain", chainId: 56 },
  standard: "ERC-721",
  maxSupply: 5000,

  // Single global supply of 5,000 shared by all 5 classes.
  tiers: [
    { id: "starter", name: "STARTER",  priceBnb: 0,      hashRateMh: 10,   shares: 1,   maxPerWallet: 1,   color: "#7f8a99", blurb: "The first key to the ledger. Free to begin." },
    { id: "bronze",  name: "BRONZE",   priceBnb: 0.0003, hashRateMh: 100,  shares: 10,  maxPerWallet: null, color: "#c08a4b", blurb: "A solid clockwork core, built to run." },
    { id: "silver",  name: "SILVER",   priceBnb: 0.0007, hashRateMh: 250,  shares: 25,  maxPerWallet: null, color: "#c7ccd4", blurb: "Polished circuits, a sharper signal." },
    { id: "gold",    name: "GOLD",     priceBnb: 0.0014, hashRateMh: 500,  shares: 50,  maxPerWallet: null, color: "#d4af37", blurb: "The ledger's trusted workhorse." },
    { id: "diamond", name: "DIAMOND",  priceBnb: 0.0042, hashRateMh: 1500, shares: 150, maxPerWallet: null, color: "#7fd4e6", blurb: "The rarest node. Maximum hash, maximum shares." }
  ],

  // OSR reward token (BEP-20). Simulation parameters — NOT a profit promise.
  osr: {
    symbol: "OSR",
    standard: "BEP-20",
    maxSupply: 1000000000,
    miningAllocation: 700000000,
    reserveAllocation: 300000000,
    era1PerSharePerDay: 10,
    eraDays: 30,                 // or 150,000 new shares — whichever first
    eraNewSharesTrigger: 150000,
    halving: 0.5                 // Era n rate = 10 * (0.5 ^ (n-1))
  },

  // ---- DEMO state (clearly labelled DEMO on every page) ----
  demo: {
    minted: 0,                  // demo minted count
    totalHashRateMh: 0,
    totalShares: 0,
    currentEra: 1,
    eraDay: 1,
    eraSharesProgress: 0,       // shares minted in current era (demo)
    osrDistributed: 0,
    osrClaimableDemo: 0,
    contractStatus: "PENDING — not deployed",
    note: "All numbers on this site are DEMO / simulation values. No contract is deployed and no live data exists yet."
  }
};

function eraRate(era) {
  return OSSYREL.osr.era1PerSharePerDay * Math.pow(OSSYREL.osr.halving, era - 1);
}

function formatBnb(n) {
  if (n === 0) return "FREE";
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + " BNB";
}

function formatNum(n) {
  return n.toLocaleString("en-US");
}

/* ---------- Generative node artwork (inline SVG, per tier) ----------
   Deterministic from token id + tier — no raster images. */
function nodeArtSVG(tierId, tokenId, size) {
  const tier = OSSYREL.tiers.find(t => t.id === tierId) || OSSYREL.tiers[0];
  const c = tier.color;
  const seed = (tokenId * 2654435761) % 4294967296;
  const rnd = (i) => {
    const x = Math.sin(seed + i * 78.233) * 10000;
    return x - Math.floor(x);
  };
  const cx = 100, cy = 100;
  let rings = "";
  const ringCount = 3 + Math.floor(rnd(1) * 3);
  for (let i = 0; i < ringCount; i++) {
    const r = 26 + i * 17 + rnd(i + 10) * 8;
    rings += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${c}" stroke-opacity="${(0.55 - i * 0.12).toFixed(2)}" stroke-width="${(1.6 - i * 0.3).toFixed(1)}" ${i % 2 ? 'stroke-dasharray="3 6"' : ""}/>`;
  }
  let spokes = "";
  const spokeCount = 6 + Math.floor(rnd(2) * 4);
  for (let i = 0; i < spokeCount; i++) {
    const a = (i / spokeCount) * Math.PI * 2 + rnd(i + 20) * 0.4;
    const x2 = cx + Math.cos(a) * 88, y2 = cy + Math.sin(a) * 88;
    spokes += `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-opacity="0.28" stroke-width="1"/>`;
    spokes += `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${(2 + rnd(i + 30) * 2.5).toFixed(1)}" fill="${c}" fill-opacity="0.75"/>`;
  }
  const s = size || 200;
  return `<svg viewBox="0 0 200 200" width="${s}" height="${s}" role="img" aria-label="${tier.name} node artwork, token ${tokenId}" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" fill="#0b0b0d"/>
    <rect x="6" y="6" width="188" height="188" fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="1"/>
    <rect x="14" y="14" width="172" height="172" fill="none" stroke="${c}" stroke-opacity="0.18" stroke-width="1"/>
    ${spokes}${rings}
    <circle cx="${cx}" cy="${cy}" r="17" fill="#050506" stroke="${c}" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="8" fill="${c}"/>
    <text x="${cx}" y="182" text-anchor="middle" font-family="monospace" font-size="10" letter-spacing="3" fill="${c}">#${tokenId} · ${tier.name}</text>
  </svg>`;
}

function renderNodeArt(el, tierId, tokenId) {
  if (el) el.innerHTML = nodeArtSVG(tierId, tokenId);
}

/* ---------- Shared header/footer helpers ---------- */
function bindWalletButtons() {
  document.querySelectorAll("[data-wallet-btn]").forEach(btn => {
    btn.addEventListener("click", () => {
      const status = document.querySelectorAll("[data-wallet-status]");
      status.forEach(s => { s.textContent = "DEMO — wallet not connected"; });
      logLine("wallet", "Connect Wallet clicked (DEMO). No wallet is connected and no seed phrase was requested. Real wallet connection is PENDING contract integration.", "warn");
      alert("DEMO mode: no wallet is connected.\n\nThis site is a static demo. It will never ask for a seed phrase or private key. Real wallet connection is PENDING until the contract is deployed.");
    });
  });
}

function logLine(scope, message, kind) {
  const log = document.querySelector(`[data-log="${scope}"]`) || document.querySelector("[data-log]");
  if (!log) return;
  const time = new Date().toLocaleTimeString("en-GB");
  const line = document.createElement("div");
  line.innerHTML = `<span class="t">[${time}]</span> <span class="${kind || "info"}">${message}</span>`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

/* Fill every [data-stat] element from the central DEMO state. */
function fillDemoStats() {
  const d = OSSYREL.demo;
  const map = {
    "max-supply": formatNum(OSSYREL.maxSupply),
    "minted": formatNum(d.minted),
    "minted-pct": ((d.minted / OSSYREL.maxSupply) * 100).toFixed(1) + "%",
    "total-hash": formatNum(d.totalHashRateMh) + " MH/s",
    "total-shares": formatNum(d.totalShares),
    "current-era": "Era " + d.currentEra,
    "era-rate": eraRate(d.currentEra) + " OSR / share / day",
    "era-day": "Day " + d.eraDay + " / " + OSSYREL.osr.eraDays,
    "osr-max": formatNum(OSSYREL.osr.maxSupply) + " OSR",
    "osr-mining": formatNum(OSSYREL.osr.miningAllocation) + " OSR",
    "osr-reserve": formatNum(OSSYREL.osr.reserveAllocation) + " OSR",
    "osr-distributed": formatNum(d.osrDistributed) + " OSR",
    "osr-claimable": formatNum(d.osrClaimableDemo) + " OSR",
    "contract-status": d.contractStatus,
    "chain": OSSYREL.chain.name + " · Chain ID " + OSSYREL.chain.chainId
  };
  document.querySelectorAll("[data-stat]").forEach(el => {
    const key = el.getAttribute("data-stat");
    if (map[key] !== undefined) el.textContent = map[key];
  });
  document.querySelectorAll(".minted-bar").forEach(el => {
    el.style.width = ((d.minted / OSSYREL.maxSupply) * 100) + "%";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  fillDemoStats();
  bindWalletButtons();
  document.querySelectorAll("[data-node-art]").forEach(el => {
    renderNodeArt(el, el.getAttribute("data-tier"), parseInt(el.getAttribute("data-token") || "1", 10));
  });
});
