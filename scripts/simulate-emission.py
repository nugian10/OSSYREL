#!/usr/bin/env python3
"""
OSSYREL — THE HASH LEDGER: OSR emission simulator (DEMO).

Simulates OSR reward emission under the project spec:
  - Era 1 rate: 10 OSR per share per day; halving every Era
    (Era 2 = 5, Era 3 = 2.5, Era 4 = 1.25, Era 5 = 0.625, ...).
  - Era transition: every 30 days OR when 150,000 new shares have
    been minted since the Era started, whichever comes first.
  - Emission accrues per outstanding share per day at the current
    Era rate. Deterministic: no user interaction needed.
  - Mining pool cap: 700,000,000 OSR (of 1,000,000,000 total supply;
    remaining 300,000,000 OSR is reserve).

No external dependencies. All numbers are DEMO / simulation only —
NOT a promise of price, profit, liquidity, or financial return.

Usage:
    python3 simulate-emission.py            # all scenarios
    python3 simulate-emission.py --days 1825
"""

import argparse

# ---------------------------------------------------------------- constants
POOL_MINING = 700_000_000      # OSR allocated to mining
POOL_TOTAL = 1_000_000_000     # OSR max supply
RESERVE = 300_000_000          # OSR reserve
ERA1_RATE = 10.0               # OSR per share per day, Era 1
ERA_DAYS = 30                  # max days per Era
ERA_SHARE_TRIGGER = 150_000    # new shares minted -> Era advances
MAX_SUPPLY_NFT = 5_000

# Class spec: (price BNB, hash MH/s, shares per NFT, max per wallet)
CLASSES = {
    "STARTER": {"price": 0.0,    "hash": 10,   "shares": 1,   "max_per_wallet": 1},
    "BRONZE":  {"price": 0.0003, "hash": 100,  "shares": 10,  "max_per_wallet": None},
    "SILVER":  {"price": 0.0007, "hash": 250,  "shares": 25,  "max_per_wallet": None},
    "GOLD":    {"price": 0.0014, "hash": 500,  "shares": 50,  "max_per_wallet": None},
    "DIAMOND": {"price": 0.0042, "hash": 1500, "shares": 150, "max_per_wallet": None},
}


def era_rate(era: int) -> float:
    """OSR per share per day for a given Era (1-based)."""
    return ERA1_RATE / (2 ** (era - 1))


def simulate(mint_schedule, days=1825):
    """
    Day-by-day simulation.

    mint_schedule: dict {day (1-based): {class_name: count, ...}}
    Returns dict with totals and per-era breakdown.
    """
    shares = 0                 # outstanding shares
    era = 1
    days_in_era = 0
    shares_in_era = 0          # shares minted since Era started
    emitted_total = 0.0
    emitted_1y = 0.0
    emitted_by_era = {}
    era_log = []               # (era, start_day, end_day, rate, shares_at_end)
    era_start_day = 1
    pool_exhaust_day = None
    nfts_minted = 0

    for day in range(1, days + 1):
        # --- mints happen at start of the day -------------------------
        for cls, count in mint_schedule.get(day, {}).items():
            n = count
            shares += CLASSES[cls]["shares"] * n
            shares_in_era += CLASSES[cls]["shares"] * n
            nfts_minted += n

        # --- emission for the day at current Era rate ----------------
        rate = era_rate(era)
        daily = shares * rate
        emitted_total += daily
        emitted_by_era[era] = emitted_by_era.get(era, 0.0) + daily
        if day <= 365:
            emitted_1y += daily
        if pool_exhaust_day is None and emitted_total >= POOL_MINING:
            pool_exhaust_day = day

        days_in_era += 1

        # --- Era transition check (end of day) -----------------------
        if days_in_era >= ERA_DAYS or shares_in_era >= ERA_SHARE_TRIGGER:
            era_log.append((era, era_start_day, day, rate, shares))
            era += 1
            days_in_era = 0
            shares_in_era = 0
            era_start_day = day + 1

    if era_start_day <= days:
        era_log.append((era, era_start_day, days, era_rate(era), shares))

    return {
        "nfts_minted": nfts_minted,
        "total_shares": shares,
        "era1_daily_full": shares * ERA1_RATE,
        "emitted_1y": emitted_1y,
        "emitted_5y": emitted_total,
        "pool_exhaust_day": pool_exhaust_day,
        "pool_remaining_5y": POOL_MINING - emitted_total,
        "pool_used_pct_5y": 100.0 * emitted_total / POOL_MINING,
        "final_era": era,
        "emitted_by_era": emitted_by_era,
        "era_log": era_log,
        # Reference: how long the pool would last if Era 1 rate never halved
        "no_halving_days_to_exhaust": (
            POOL_MINING / (shares * ERA1_RATE) if shares else float("inf")
        ),
        # Theoretical ceiling: with 30-day halving, total emission over
        # infinite time <= shares * rate * 30 * (1 + 1/2 + 1/4 + ...)
        #                        = shares * 10 * 30 * 2 = shares * 600
        "theoretical_max_emission": shares * ERA1_RATE * ERA_DAYS * 2,
    }


# ---------------------------------------------------------------- scenarios
def build_schedule_a():
    """
    Scenario A — slow / realistic mixed adoption (DEMO assumptions).
    Mint ramp-up (NFTs per day), sold out at 5,000:
      days   1-30 : 10/day   =   300
      days  31-90 : 25/day   = 1,500
      days 91-180 : 40/day   = 3,600  -> capped at 5,000 total
    => sell-out on day ~171 (300+1500 = 1,800 by day 90; remaining
       3,200 at 40/day = 80 days -> day 170).
    Class mix (constant): STARTER 20%, BRONZE 40%, SILVER 25%,
    GOLD 10%, DIAMOND 5%.
    Note: integer rounding of the daily mix under-allocates DIAMOND
    on low-volume days (e.g. int(10 x 0.05) = 0), so the realised
    total is 108,900 shares (21.78 avg/NFT), not the nominal
    22.95 avg/NFT (114,750 shares) of the raw percentages.
    """
    mix = {"STARTER": 0.20, "BRONZE": 0.40, "SILVER": 0.25,
           "GOLD": 0.10, "DIAMOND": 0.05}
    schedule = {}
    remaining = MAX_SUPPLY_NFT
    day = 1
    while remaining > 0 and day <= 365:
        if day <= 30:
            rate = 10
        elif day <= 90:
            rate = 25
        elif day <= 180:
            rate = 40
        else:
            rate = 20
        n = min(rate, remaining)
        # split by mix, rounding to whole NFTs; remainder -> BRONZE
        counts = {}
        assigned = 0
        for cls, frac in mix.items():
            c = int(n * frac)
            counts[cls] = c
            assigned += c
        counts["BRONZE"] += n - assigned
        schedule[day] = {k: v for k, v in counts.items() if v}
        remaining -= n
        day += 1
    return schedule


def build_schedule_b():
    """
    Scenario B — all 5,000 Diamond (worst case for the pool).
    5,000 x 150 shares = 750,000 shares.
    Mint pace (DEMO assumption): 167/day for 30 days
    (167*29 = 4,843 + 157 on day 30 = 5,000; sold out day 30).
    """
    schedule = {}
    remaining = MAX_SUPPLY_NFT
    for day in range(1, 31):
        n = min(167, remaining)
        schedule[day] = {"DIAMOND": n}
        remaining -= n
    return schedule


def build_schedule_c():
    """
    Scenario C — all cheap classes (STARTER / BRONZE mix).
    50% STARTER (1 share) + 50% BRONZE (10 shares) = 5.5 shares avg.
    Mint pace (DEMO assumption): 50/day for 100 days = 5,000.
    """
    schedule = {}
    for day in range(1, 101):
        schedule[day] = {"STARTER": 25, "BRONZE": 25}
    return schedule


SCENARIOS = [
    ("A", "Slow / realistic mixed adoption",
     "Ramp-up 10->25->40/day, sold out ~day 170; mix S20/B40/Si25/G10/D5",
     build_schedule_a),
    ("B", "All 5,000 DIAMOND (worst case for pool)",
     "167/day for 30 days, sold out day 30; 750,000 shares",
     build_schedule_b),
    ("C", "All cheap: 50% STARTER + 50% BRONZE",
     "50/day for 100 days, sold out day 100; 27,500 shares",
     build_schedule_c),
]


def fmt(x):
    return f"{x:,.2f}"


def main():
    ap = argparse.ArgumentParser(description="OSSYREL OSR emission simulator (DEMO)")
    ap.add_argument("--days", type=int, default=1825,
                    help="simulation horizon in days (default 1825 = 5 years)")
    args = ap.parse_args()
    days = args.days
    years = days / 365.0

    print("=" * 72)
    print("OSSYREL — THE HASH LEDGER | OSR EMISSION SIMULATION (DEMO)")
    print("=" * 72)
    print(f"Pool mining: {POOL_MINING:,} OSR | Total supply: {POOL_TOTAL:,} OSR")
    print(f"Reserve: {RESERVE:,} OSR | Era 1 rate: {ERA1_RATE} OSR/share/day")
    print(f"Era: 30 days OR {ERA_SHARE_TRIGGER:,} new shares, whichever first; "
          f"rate halves each Era")
    print(f"Horizon: {days} days (~{years:.1f} years)")
    print()

    for key, title, desc, builder in SCENARIOS:
        r = simulate(builder(), days=days)
        print("-" * 72)
        print(f"Scenario {key}: {title}")
        print(f"  Assumptions: {desc}")
        print(f"  NFTs minted            : {r['nfts_minted']:,}")
        print(f"  Total shares           : {r['total_shares']:,}")
        print(f"  Era 1 daily emission   : {fmt(r['era1_daily_full'])} OSR/day "
              f"(at full shares, Era 1 rate)")
        print(f"  Pool exhausted         : "
              f"{'DAY ' + str(r['pool_exhaust_day']) if r['pool_exhaust_day'] else 'NEVER (within horizon)'}")
        print(f"  Total emission 1 year  : {fmt(r['emitted_1y'])} OSR "
              f"({100.0 * r['emitted_1y'] / POOL_MINING:.2f}% of 700M pool)")
        print(f"  Total emission {years:.0f} years : {fmt(r['emitted_5y'])} OSR "
              f"({r['pool_used_pct_5y']:.2f}% of 700M pool)")
        print(f"  Pool remaining ({years:.0f}y)  : {fmt(r['pool_remaining_5y'])} OSR")
        print(f"  Final Era reached      : {r['final_era']} "
              f"(rate {era_rate(r['final_era']):.6f} OSR/share/day)")
        print(f"  Theoretical max (inf.) : {fmt(r['theoretical_max_emission'])} OSR "
              f"({100.0 * r['theoretical_max_emission'] / POOL_MINING:.2f}% of pool)")
        print(f"  Reference — no halving : pool would last "
              f"{r['no_halving_days_to_exhaust']:.1f} days at Era 1 rate")
        print(f"  Emission by Era (first 8): "
              + ", ".join(f"E{e}={fmt(v)}" for e, v in
                          sorted(r['emitted_by_era'].items())[:8]))
        print(f"  Era transitions (first 6):")
        for e, s, t, rate, sh in r['era_log'][:6]:
            print(f"    Era {e}: days {s}-{t}, rate {rate} OSR/share/day, "
                  f"shares at end {sh:,}")
        print()

    print("=" * 72)
    print("CONCLUSION (DEMO — not financial advice):")
    print("  With 30-day halving, total emission is geometrically bounded;")
    print("  the share trigger only shortens early Eras, so real emission")
    print("  is BELOW the ceiling. No scenario exhausts the pool:")
    print("  worst case (B, 750,000 shares) uses ~7.2% in 5 years, and")
    print("  even its infinite-time ceiling is ~64% of the pool.")
    print("  The flip side: rewards decay to near zero within ~12 months")
    print("  (Era ~13, rate ~0.005 OSR/share/day) — see TOKENOMICS.md.")
    print("  WITHOUT halving, the same shares would drain the pool in")
    print("  93-2,545 days — the halving schedule is what makes the")
    print("  700M allocation sustainable. See docs/TOKENOMICS.md.")
    print("=" * 72)


if __name__ == "__main__":
    main()
