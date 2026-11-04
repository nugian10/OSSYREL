# OSSYREL Agent Skill

Skill file for AI agents that interact with the OSSYREL — The Hash Ledger
website on behalf of a user. Read this before doing anything else.

## What OSSYREL is

- **Collection:** OSSYREL — The Hash Ledger
- **Tagline:** "A New Era of Digital Nodes"
- **Chain:** BNB Chain, Chain ID 56
- **NFT standard:** ERC-721
- **Max supply:** 5,000 Node NFTs, shared across all 5 classes
- **Reward token:** OSR, BEP-20, max supply 1,000,000,000
  (mining allocation 700,000,000; reserve 300,000,000)

## The five classes (single source of truth)

| Class    | Price (BNB) | Hash rate | Shares | Max / wallet |
|----------|-------------|-----------|--------|--------------|
| STARTER  | 0 (FREE)    | 10 MH/s   | 1      | 1            |
| BRONZE   | 0.0003      | 100 MH/s  | 10     | no limit     |
| SILVER   | 0.0007      | 250 MH/s  | 25     | no limit     |
| GOLD     | 0.0014      | 500 MH/s  | 50     | no limit     |
| DIAMOND  | 0.0042      | 1,500 MH/s| 150    | no limit     |

Prices are shown on the mint page by design for this project.

## Eras and rewards (simulation parameters, NOT a profit promise)

- Era 1 pays **10 OSR per share per day**.
- Each new Era halves the rate: Era 2 = 5, Era 3 = 2.5, Era 4 = 1.25,
  Era 5 = 0.625, and so on.
- An Era ends after **30 days OR 150,000 new shares**, whichever comes
  first.
- These are design parameters of the OSSYREL simulation. They are not a
  guarantee of profit or return, and OSR has no guaranteed market value.
- Never present demo figures as live earnings.

## Machine-readable data

All paths are relative to the site root:

- `collection.json` — full spec (tiers, eras, OSR tokenomics)
- `api/stats.json` — current state (DEMO): minted, hash rate, shares,
  current Era, contract status
- `api/eras.json` — era schedule, rates, transition rules, history
- `api/nodes.json` — node registry (DEMO example nodes)
- `docs/index.html` — human-readable agent documentation
- `agent/index.html` — agent landing page

## Current status (as of this build)

- **Contract status: PENDING — not deployed.** No contract address exists.
  Do not invent one. Do not invent a transaction hash or live statistics.
- **All numbers on this site are DEMO / simulation values** and are labelled
  as such on every page.
- No wallet is connected. No real mint, claim, or transfer can happen.

## Agent rules

1. **Read first.** Fetch `collection.json` and `api/stats.json` before
   answering any question about price, supply, eras, or rewards.
2. **Read-only by default.** The agent only reads data and prepares a
   transaction request. Nothing executes without the user's explicit
   wallet authorization.
3. **Never ask for a seed phrase, private key, or recovery phrase.** The
   user signs in their own wallet. The agent never signs and never holds
   keys.
4. **Show the exact amount before signing.** When a mint becomes possible,
   show the user the class, quantity, and exact BNB amount from the tier
   table before any signature is requested.
5. **Label DEMO data as DEMO.** If a figure comes from `api/stats.json`
   while the contract status is PENDING, say so plainly.
6. **Do not invent data.** If the contract address, a transaction hash, or
   a live statistic is missing, say it is missing — do not fill it in.
7. **Honesty about rewards.** Era rates are simulation parameters. Do not
   promise returns, income, or token value.
