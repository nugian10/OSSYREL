# OSSYREL — THE HASH LEDGER: System Architecture

> **Status:** Stage 1 design document (local only, DEMO).
> No contract is deployed, no address exists yet. All example numbers
> are DEMO values, not live data and not a promise of price, profit,
> liquidity, or financial return.

## 1. Overview

OSSYREL is a collection of **5,000 ERC-721 "Node" NFTs** on BNB Smart
Chain (chain ID 56). Each Node belongs to one of five classes and
carries a fixed number of **shares**. Shares earn the BEP-20 reward
token **OSR** (max supply 1,000,000,000) at a rate set by a
deterministic **Era Engine**: Era 1 pays 10 OSR per share per day and
the rate halves every Era.

The system is split into **five modular contracts** so that minting,
mining accounting, the token, and reward distribution can each be
audited, tested, and (where safe) upgraded independently.

```
                          ┌─────────────────────┐
                          │  OSSYRELNodeNFT     │  ERC-721, 5 classes,
                          │  (ERC-721 + shares) │  5,000 max supply
                          └────────┬────────────┘
                                   │ tokenId / class / shares
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ MintController   │  │ MiningEngine     │  │ RewardController │
   │ (sales + gates)  │  │ (Era + accrual)  │  │ (claim + settle) │
   └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
            │                     │                     │
            └─────────────┬───────┴──────────┬──────────┘
                          ▼                  ▼
                 ┌────────────────┐  ┌────────────────┐
                 │ OSSYRELToken   │  │   (off-chain)  │
                 │ (OSR BEP-20)   │  │  site / index  │
                 └────────────────┘  └────────────────┘
```

## 2. The Five Contracts

### 2.1 OSSYRELNodeNFT — the Node token (ERC-721)

- ERC-721 (OpenZeppelin), symbol TBD in Stage 3, max supply **5,000**.
- Each token stores: `class` (enum 0–4), `shares`, `hashRate`
  (MH/s, informational), `mintedAt` (timestamp).
- Class table (fixed at deployment, immutable afterwards):

| Class   | Price (BNB) | Hash rate | Shares | Max / wallet |
|---------|-------------|-----------|--------|--------------|
| STARTER | free (0)    | 10 MH/s   | 1      | 1            |
| BRONZE  | 0.0003      | 100 MH/s  | 10     | —            |
| SILVER  | 0.0007      | 250 MH/s  | 25     | —            |
| GOLD    | 0.0014      | 500 MH/s  | 50     | —            |
| DIAMOND | 0.0042      | 1,500 MH/s| 150    | —            |

- One global supply of 5,000 across all classes (no per-class cap in
  the spec — class mix is whatever the market mints; see
  `docs/TOKENOMICS.md` for the worst-case analysis).
- Only the MintController may call `mint()`. Ownership of the NFT
  contract sits with the project owner (see §7).

### 2.2 OSSYRELMintController — sales and gates

- Owns the mint flow: `mint(classId)` payable, one NFT per call.
- Enforces, in order:
  1. Mint is active (owner switch).
  2. `totalSupply < 5,000`.
  3. Exact payment for the class (`msg.value == price`; STARTER = 0).
  4. STARTER max 1 per wallet.
  5. (Optional, owner-configurable) agent-only gate, following the
     pattern used by the project's sibling collections.
- Forwards received BNB to the **revenue/payout wallet** immediately
  (no funds held in the controller).
- Emits `Minted(tokenId, buyer, classId, shares, price)`.
- Calls `OSSYRELNodeNFT.mint()` and registers the new shares with the
  MiningEngine in the same transaction, so a Node never exists
  without its mining state.

### 2.3 OSSYRELMiningEngine — Era Engine + reward accounting

This is the heart of the system. It owns **all time and rate state**
and answers one question: *how much OSR has a share earned?*

#### Era Engine (deterministic)

- Era 1 starts at deployment (`genesisTimestamp`).
- Era `n` rate: `10 / 2^(n-1)` OSR per share per day
  (10, 5, 2.5, 1.25, 0.625, …).
- An Era advances when **either** condition is met, whichever comes
  first:
  - **30 days** have passed since the Era started, **or**
  - **150,000 new shares** have been minted since the Era started.
- The Era is advanced lazily: any state-changing call first runs
  `pokeEra()`, which loops while a transition condition holds and
  moves to the next Era. Because both triggers are on-chain facts
  (block timestamp, cumulative minted shares), the Era schedule is
  **fully deterministic** — it does not depend on anyone opening the
  website or calling a keeper.
- State kept: `currentEra`, `eraStartTimestamp`,
  `sharesMintedInEra`, `totalShares`, plus a per-Era history
  (`eraStart`, `rate`) so any past accrual can be recomputed.

#### Reward accounting (per-share, per-time accrual)

- Classic "accumulated reward per share" accounting (the same pattern
  used by MasterChef-style farms), adapted for a changing rate:
  - `accOSRPerShare` — cumulative OSR earned per share, scaled by
    1e18. It increases over time at the current Era rate.
  - Each token stores `rewardDebt` = shares × accOSRPerShare at the
    last settlement.
  - `pending(tokenId)` = shares × (accOSRPerShare − rewardDebt) / 1e18.
- Accrual is **continuous in time, discrete in rate**: the engine
  records `lastAccrualTimestamp`; on every update it advances
  accrual in segments, one segment per Era boundary crossed, so a
  rate change mid-period is priced exactly.
- Per-token states exposed by the engine:
  - **pending** — earned but not yet claimed,
  - **claimable** — pending that is currently available to claim
    (identical to pending while claiming is open; kept separate so a
    future vesting/lock can be added without changing the interface),
  - **claimed** — cumulative OSR already paid out for that token.

#### Transfer settlement (anti double-claim)

- `OSSYRELNodeNFT` hooks `beforeTokenTransfer`: before a transfer
  completes, the engine **settles the old owner's reward up to the
  transfer time** (credits it to the old owner's claimable balance),
  then resets the token's `rewardDebt` to the current
  `accOSRPerShare` so accrual from the transfer moment onwards
  belongs to the **new owner**.
- Reward balances are therefore **per-wallet**, not per-token, after
  settlement: a seller keeps what they earned, a buyer starts
  earning only from the moment they receive the Node. No reward can
  be claimed twice for the same share-time.

### 2.4 OSSYRELToken — OSR (BEP-20)

- Standard BEP-20 / ERC-20 (OpenZeppelin), 18 decimals, max supply
  **1,000,000,000 OSR**, mintable only by authorised minters.
- Allocation (enforced in code, not by promise):
  - **700,000,000 OSR** — mining pool, held by / minted to the
    RewardController as rewards are claimed.
  - **300,000,000 OSR** — reserve, minted once at deployment to a
    reserve wallet controlled by the owner.
- No transfer tax, no burn, no pause in the base design. Any future
  change (e.g. a fee) requires a new deployment decision, not a
  silent parameter change.

### 2.5 OSSYRELRewardController — claims and pool control

- The only contract allowed to mint OSR from the mining pool
  (up to the 700,000,000 cap, enforced on-chain:
  `minedTotal + amount <= 700_000_000`).
- `claim(tokenIds[])` — settles pending rewards for the caller's
  tokens, mints the exact OSR amount, and transfers it to the
  caller. Reverts on zero pending. Updates `claimed` per token.
- `claimAll()` convenience wrapper.
- Guards: reentrancy guard, checks-effects-interactions, and a
  per-claim event `Claimed(user, tokenIds, amount, era)`.
- The controller never holds user funds; it mints on demand against
  the hard pool cap, so it cannot pay out more than the allocation.

## 3. Data Flow

### Mint

```
buyer --mint(class)--> MintController --checks--> NodeNFT.mint()
                                        └--> MiningEngine.registerShares()
                                             (sharesMintedInEra += shares;
                                              maybe advance Era)
buyer BNB --> revenue wallet (direct forward)
```

### Accrual (passive, no transaction needed)

```
time passes --> MiningEngine.accOSRPerShare grows
                at current Era rate (view function for the site)
```

### Claim

```
owner --claim(ids)--> RewardController --pending?--> MiningEngine.settle()
                      └--> OSSYRELToken.mint(owner, amount)
                           (capped at 700M total)
```

### Transfer

```
seller --> NodeNFT.transfer --> MiningEngine.settle(seller, up to now)
                                + reset token rewardDebt
                             --> buyer accrues from transfer time
```

## 4. Era Rules (deterministic, restated)

1. Era 1 = 10 OSR/share/day; each Era halves the rate.
2. An Era lasts at most 30 days.
3. An Era also ends early once 150,000 new shares are minted in it.
4. Both triggers are on-chain facts; no keeper, no website visit,
   no manual step is required for an Era to advance.
5. Because the rate halves every Era, total lifetime emission is
   geometrically bounded (see `docs/TOKENOMICS.md`): even the
   worst case (all 5,000 DIAMOND = 750,000 shares) cannot exceed
   450,000,000 OSR — 64.29% of the 700M pool — over infinite time.

## 5. Tokenomics Control

- Hard cap on mining minting: 700,000,000 OSR, enforced in
  `OSSYRELRewardController`.
- Rate schedule is immutable after deployment (no owner function
  changes Era length, share trigger, or base rate).
- The 300,000,000 OSR reserve is minted once at deployment; its use
  is an owner decision recorded off-chain, not an automatic emission.
- Simulation results and sustainability analysis:
  `docs/TOKENOMICS.md` and `scripts/simulate-emission.py`.

## 6. Node Management

- `ownerOf`, `tokenURI`, class/shares metadata served from the
  collection metadata (Stage 2).
- No upgrade proxy in v1: contracts are immutable once deployed.
  Any change to Era rules, rates, or class table requires a new
  deployment and a new collection — this is deliberate, so holders
  can trust the rules they minted under.
- Owner functions (all behind `Ownable`, multi-sig recommended
  before mainnet): `setMintActive`, `setRevenueWallet`,
  `setMintController` wiring. No owner function can seize NFTs,
  change a minted Node's class/shares, or mint OSR beyond the pool.

## 7. Security

- **Roles (assumed, to be confirmed by the user before any deploy):**
  owner = My Wallet `0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097`;
  revenue/payout = Binance Agentic Wallet
  `0x89c37649Ba3BAA9E1ce028612b7DE4e9c3a947B7`.
  No other wallet is assumed to hold any role.
- **Threats addressed:**
  - Double-claim / double-counting — per-share accumulator +
    per-token `rewardDebt` + transfer settlement (§2.3).
  - Reentrancy on claim/mint — guards + checks-effects-interactions.
  - Era manipulation — triggers are block timestamp and on-chain
    minted shares only; no oracle, no off-chain input.
  - Unlimited minting — `totalSupply <= 5,000` and pool cap
    `700,000,000 OSR` enforced on-chain.
  - Owner abuse surface — no function changes rates, class table,
    or minted Nodes; owner powers are listed in §6.
- **Not yet done (blocking, see README.md PENDING):** independent
  security review / audit, testnet end-to-end test, mainnet deploy.
  Real reward distribution MUST NOT be activated before an
  independent security review.
- **Known limitations:**
  - `block.timestamp` can be nudged by miners/validators by seconds;
    irrelevant at a 30-day Era scale.
  - STARTER is free (0 BNB) with max 1 per wallet — Sybil resistance
    relies on the per-wallet cap only; a user with many wallets can
    mint many STARTERs. This is accepted in the spec; if it becomes
    a problem, the mitigation is a paid or allowlisted STARTER, which
    is a spec change, not a silent fix.
  - No per-wallet cap on paid classes (per spec).

## 8. Open Design Questions (for the user, before Stage 3)

1. Confirm owner / revenue wallet roles (see §7).
2. Agent-only mint gate: on or off at launch? (Sibling collections
   use an agent-only site flow; the contract gate is optional.)
3. OSR token symbol/decimals are fixed (OSR, 18); confirm the
   reserve wallet address before deployment.
4. Claim UX: claim per-token, per-wallet, or both? (Contract
   supports both; site decides.)

---

*All figures in this document are DEMO/spec values. Nothing here is a
promise of price, profit, liquidity, or financial return.*
