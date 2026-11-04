# OSSYREL — THE HASH LEDGER: Tokenomics & Emission Simulation

> **Status:** Stage 1 analysis (local only, DEMO).
> All numbers below come from `scripts/simulate-emission.py`
> (Python 3, no external dependencies). Run it yourself:
> `python3 scripts/simulate-emission.py`.
> **Nothing here is a promise of price, profit, liquidity, or
> financial return.** OSR is a reward parameter of the system design,
> not an investment product.

## 1. Fixed Parameters (spec)

| Parameter | Value |
|---|---|
| Node NFT max supply | 5,000 (ERC-721, BNB Chain, chain ID 56) |
| OSR max supply | 1,000,000,000 |
| Mining allocation | 700,000,000 OSR (70%) |
| Reserve allocation | 300,000,000 OSR (30%) |
| Era 1 rate | 10 OSR per share per day |
| Halving | rate halves every Era (10, 5, 2.5, 1.25, 0.625, …) |
| Era length | 30 days **or** 150,000 new shares minted, whichever first |

Classes (shares per NFT): STARTER 1, BRONZE 10, SILVER 25,
GOLD 50, DIAMOND 150.

## 2. Simulation Method

Day-by-day simulation over 1,825 days (5 years). Mints happen at the
start of each day; that day's emission = outstanding shares × current
Era rate. At the end of each day the Era advances if 30 days have
passed or 150,000 new shares were minted in the Era. Emission
accrues per share per day — exactly the accounting the MiningEngine
will do on-chain (see `docs/ARCHITECTURE.md` §2.3).

## 3. Scenarios and Results

### Scenario A — Slow / realistic mixed adoption (DEMO assumptions)

- Mint ramp-up: 10/day (days 1–30), 25/day (days 31–90),
  40/day (days 91–180); sold out ~day 170.
- Class mix: STARTER 20%, BRONZE 40%, SILVER 25%, GOLD 10%,
  DIAMOND 5%. (Integer rounding of the daily mix under-allocates
  DIAMOND on low-volume days, so the realised average is
  21.78 shares/NFT, not the nominal 22.95.)

| Metric | Value |
|---|---|
| NFTs minted | 5,000 |
| Total shares | **108,900** |
| Era 1 daily emission (full shares) | **1,089,000 OSR/day** |
| Pool exhausted | **Never** (within 5 years) |
| Total emission, 1 year | **9,971,739.70 OSR** (1.42% of pool) |
| Total emission, 5 years | **9,986,362.50 OSR** (1.43% of pool) |
| Pool remaining after 5 years | 690,013,637.50 OSR |
| Theoretical max (infinite time) | 65,340,000 OSR (9.33% of pool) |
| Reference — no halving, pool would last | 642.8 days at Era 1 rate |

### Scenario B — All 5,000 DIAMOND (worst case for the pool)

- Mint pace (DEMO assumption): 167/day for 30 days, sold out day 30.
- 5,000 × 150 shares = **750,000 shares** — the maximum possible
  under the spec.

| Metric | Value |
|---|---|
| NFTs minted | 5,000 |
| Total shares | **750,000** |
| Era 1 daily emission (full shares) | **7,500,000 OSR/day** |
| Pool exhausted | **Never** (within 5 years) |
| Total emission, 1 year | **50,146,816.04 OSR** (7.16% of pool) |
| Total emission, 5 years | **50,158,031.25 OSR** (7.17% of pool) |
| Pool remaining after 5 years | 649,841,968.75 OSR |
| Theoretical max (infinite time) | 450,000,000 OSR (64.29% of pool) |
| Reference — no halving, pool would last | 93.3 days at Era 1 rate |

Note the share trigger in action: Era 1 lasted only **days 1–6**
(150,000 shares minted by day 6), Era 2 days 7–12, Era 3 days
13–18, Era 4 days 19–24, Era 5 days 25–54. Fast minting
compresses the early Eras and *reduces* total emission below the
theoretical ceiling.

### Scenario C — All cheap: 50% STARTER + 50% BRONZE

- Mint pace (DEMO assumption): 50/day for 100 days, sold out day 100.
- 5,000 NFTs × 5.5 avg shares = **27,500 shares**.

| Metric | Value |
|---|---|
| NFTs minted | 5,000 |
| Total shares | **27,500** |
| Era 1 daily emission (full shares) | **275,000 OSR/day** |
| Pool exhausted | **Never** (within 5 years) |
| Total emission, 1 year | **6,756,151.12 OSR** (0.97% of pool) |
| Total emission, 5 years | **6,759,843.75 OSR** (0.97% of pool) |
| Pool remaining after 5 years | 693,240,156.25 OSR |
| Theoretical max (infinite time) | 16,500,000 OSR (2.36% of pool) |
| Reference — no halving, pool would last | 2,545.5 days at Era 1 rate |

### Summary table

| Scenario | Shares | Era 1 daily | 1-year emission | 5-year emission | Pool used (5y) | Pool exhausted? |
|---|---|---|---|---|---|---|
| A — mixed adoption | 108,900 | 1,089,000 | 9,971,739.70 | 9,986,362.50 | 1.43% | Never |
| B — all DIAMOND | 750,000 | 7,500,000 | 50,146,816.04 | 50,158,031.25 | 7.17% | Never |
| C — STARTER/BRONZE | 27,500 | 275,000 | 6,756,151.12 | 6,759,843.75 | 0.97% | Never |

(All emission figures in OSR.)

## 4. Honest Findings

### Finding 1 — The 700M pool is never exhausted. Not even close.

In every scenario the pool survives 5 years with 93–99% intact.
The reason is structural: with a 30-day halving, lifetime emission
is geometrically bounded. If every Era lasted the full 30 days,
total emission ≤ shares × 10 OSR × 30 days × (1 + ½ + ¼ + …)
= **shares × 600 OSR**. The 700M pool therefore supports up to
~1,166,667 shares — but the spec caps shares at 750,000
(all DIAMOND), whose ceiling is 450M OSR (64.29% of the pool).
The share trigger only shortens early Eras, so real emission is
even lower (Scenario B: 50.16M in 5 years vs the 450M ceiling).

### Finding 2 — Without halving, the pool would drain fast.

The "no halving" reference row is the counterfactual that proves
the halving schedule is load-bearing: at a flat Era 1 rate the
700M pool would last **93.3 days** (all DIAMOND), **642.8 days**
(mixed adoption), or **2,545.5 days** (cheap mix). The halving is
what makes the allocation sustainable — it must never be removed
or weakened without a full re-simulation.

### Finding 3 — The real problem is the opposite: rewards decay to ~zero within ~1 year.

Look at the 1-year vs 5-year columns: they are nearly identical
(A: 9,971,739.70 → 9,986,362.50; B: 50,146,816.04 →
50,158,031.25; C: 6,756,151.12 → 6,759,843.75). After ~12 months
the Era rate has halved ~12 times (Era ~13, ≈ 0.0024 OSR/share/
day) and further emission is negligible. The system is pool-safe
but **front-loaded**: almost all mining rewards are paid in year 1,
and a Node held in year 2+ earns essentially nothing. Meanwhile
~650–693M OSR of the mining allocation sits unemitted forever.

This is not a bug in the simulation — it follows directly from the
spec (10 OSR/share/day, halving every 30 days). It is a design
trade-off the user should see before deployment, because it shapes
what "mining" means after year 1.

## 5. Recommendations (RECOMMENDATIONS — not spec)

These are suggestions for the user to decide on. **None of them
changes the current spec unless the user explicitly approves.**

1. **Era cap / rate floor (recommended).** Stop halving at a floor
   rate (e.g. never below 0.625 OSR/share/day, i.e. Era 5 rate) or
   cap the number of halvings, so long-term holders keep earning a
   small but non-zero reward. Effect: emission continues for years
   instead of ending in year 1; must be re-simulated, because a
   floor removes the geometric bound — with a 0.625 floor and
   750,000 shares, emission would be ~468,750 OSR/day indefinitely
   and the 700M pool would last ~4 more years after the floor is
   reached.
2. **Longer Eras after the early phase.** E.g. Era length grows
   (30 → 60 → 90 days) or the share trigger rises, stretching the
   high-rate period. Same caution as (1): re-simulate first.
3. **Use the unemitted pool deliberately.** Decide now what happens
   to the ~650M OSR that will never be mined under the current
   schedule: keep it locked, schedule it for a Phase 2 emission
   (new Era schedule voted/launched later), or reduce the mining
   allocation. Do not leave it ambiguous at launch — an unallocated
   650M OSR invites speculation about future dilution.
4. **Do NOT "fix" sustainability by raising the Era 1 rate or
   removing halving.** The simulation shows the pool is already
   safe; raising the rate only front-loads rewards further and
   shortens the earning window.
5. **STARTER Sybil note.** STARTER is free with max 1 per wallet;
   nothing stops one person using many wallets. If free STARTERs
   dominate minting, Scenario C (not A) is the realistic outcome —
   low shares, low emission, low mint revenue. Consider an
   allowlist or a small STARTER fee if that matters; this is a spec
   decision, not a silent fix.

## 6. What the Simulation Does NOT Cover

- OSR market price, liquidity, or exchange listing — none assumed.
- Secondary-market behaviour (transfers settle rewards, but the
  simulation assumes no transfers; transfers do not change total
  emission, only who receives it).
- Gas costs, claim frequency, or dust (tiny pending amounts that
  cost more gas to claim than they are worth — a real UX issue in
  late Eras, worth a minimum-claim threshold discussion in Stage 3).
- Reserve (300M OSR) usage — outside the mining emission model.

---

*Reproduce: `python3 scripts/simulate-emission.py`. All figures DEMO.
Not financial advice; not a promise of price, profit, liquidity, or
return.*
