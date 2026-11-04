# OSSYREL — THE HASH LEDGER

> **"A New Era of Digital Nodes"**

**Status: Stage 1 — design & simulation (local only, DEMO).**
No contract is deployed. No GitHub repository, no Vercel site, and
no live statistics exist yet. Every number in this repo is a DEMO /
spec value unless labelled as a simulation result.

## What is OSSYREL?

OSSYREL is a collection of **5,000 ERC-721 "Node" NFTs** on BNB Smart
Chain (chain ID 56). Each Node belongs to one of five classes, earns
**shares**, and shares earn the BEP-20 reward token **OSR** through a
deterministic Era system: Era 1 pays 10 OSR per share per day, and
the rate halves every Era. An Era lasts 30 days or until 150,000 new
shares are minted — whichever comes first.

**Disclaimer:** OSR emission parameters are system design, not a
promise of price, profit, liquidity, or financial return. Nothing in
this repository is investment advice.

## Spec (summary)

| Item | Value |
|---|---|
| Collection | THE HASH LEDGER — 5,000 Node NFTs, ERC-721, BNB Chain (56) |
| Reward token | OSR (BEP-20), max supply 1,000,000,000 |
| Mining allocation | 700,000,000 OSR |
| Reserve allocation | 300,000,000 OSR |
| Era 1 rate | 10 OSR per share per day, halving each Era |
| Era transition | 30 days **or** 150,000 new shares, whichever first |

### Classes (one global supply of 5,000)

| Class | Price | Hash rate | Shares | Max / wallet |
|---|---|---|---|---|
| STARTER | free | 10 MH/s | 1 | 1 |
| BRONZE | 0.0003 BNB | 100 MH/s | 10 | — |
| SILVER | 0.0007 BNB | 250 MH/s | 25 | — |
| GOLD | 0.0014 BNB | 500 MH/s | 50 | — |
| DIAMOND | 0.0042 BNB | 1,500 MH/s | 150 | — |

### Roles (assumed — to be confirmed by the user before any deploy)

- **Owner:** My Wallet `0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097`
- **Revenue / payout:** Binance Agentic Wallet
  `0x89c37649Ba3BAA9E1ce028612b7DE4e9c3a947B7`

## Repository Structure

```
ossyrel/
├── README.md                    # this file
├── docs/
│   ├── ARCHITECTURE.md          # 5-contract design, Era Engine, security
│   ├── TOKENOMICS.md            # emission simulation results + findings
│   └── DEPLOYMENT.md            # deploy steps for later (not now)
├── scripts/
│   └── simulate-emission.py     # OSR emission simulator (Python 3, no deps)
├── site/                        # (Stage 2 — built by another agent)
├── collection/                  # (Stage 2 — built by another agent)
└── contract/                    # (Stage 3 — built by another agent)
```

**Note:** `site/`, `collection/`, and `contract/` are built in
parallel by other agents. This Stage 1 work touches only `docs/`,
`scripts/simulate-emission.py`, and this README.

## Key Simulation Results (DEMO)

From `scripts/simulate-emission.py` — full detail in
`docs/TOKENOMICS.md`:

| Scenario | Shares | Era 1 daily | 1-year emission | 5-year emission | Pool used (5y) |
|---|---|---|---|---|---|
| A — mixed adoption | 108,900 | 1,089,000 OSR | 9,971,739.70 | 9,986,362.50 | 1.43% |
| B — all DIAMOND | 750,000 | 7,500,000 OSR | 50,146,816.04 | 50,158,031.25 | 7.17% |
| C — STARTER/BRONZE | 27,500 | 275,000 OSR | 6,756,151.12 | 6,759,843.75 | 0.97% |

**Headline finding:** the 700M mining pool is never exhausted — not
even in the worst case (all DIAMOND). But rewards decay to near zero
within ~1 year because the rate halves every 30 days, while
~650–693M OSR of the mining allocation is never emitted. See
`docs/TOKENOMICS.md` §4–§5 for the honest analysis and the
recommendations (labelled as recommendations, not spec changes).

## How to Run the Simulation

```bash
python3 scripts/simulate-emission.py            # 5-year horizon (default)
python3 scripts/simulate-emission.py --days 365 # 1-year horizon
```

Python 3, no external dependencies.

## Stage Status

| Stage | Scope | Status |
|---|---|---|
| Stage 1 | Architecture, tokenomics, simulation (this repo's `docs/` + `scripts/`) | **Done (local)** |
| Stage 2 | Website + 5,000 SVGs + metadata | In progress (parallel agent) |
| Stage 3 | Contracts (Hardhat), tests, deploy | Not started — no deploy until funded + reviewed |

## PENDING (do not skip)

- [ ] User confirms owner / revenue wallet roles.
- [ ] User decides on TOKENOMICS.md recommendations (Era floor, etc.) — or explicitly keeps the spec as-is.
- [ ] Mainnet deploy (needs BNB funds + owner signature; current balances are insufficient — see `docs/DEPLOYMENT.md`).
- [ ] BscScan source verification after deploy.
- [ ] GitHub repository creation.
- [ ] Vercel site deployment.
- [ ] **Independent security review — REQUIRED before real reward distribution is activated. Do not enable live OSR claims without it.**
- [ ] Testnet end-to-end test (mint → accrue → claim → transfer-settle).
