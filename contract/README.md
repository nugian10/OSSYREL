# OSSYREL — THE HASH LEDGER (Smart Contracts)

ERC-721 Node NFTs + OSR reward token on BNB Smart Chain (chain ID 56).
Local development stage only. **No mainnet deployment has been made from this
code, and no contract addresses exist yet.**

> ⚠️ **WARNING — READ BEFORE ANY REAL DEPLOYMENT**
>
> - These contracts are **source code only**. They have **NOT** been
>   independently audited or security-reviewed.
> - **Do NOT enable real reward distribution before an independent security
>   review.** The mining/claim system moves real value (OSR) and must be
>   reviewed by a qualified third party first.
> - Reward numbers in this project are **simulation parameters, NOT a promise
>   of profit, return, or exchange value**. OSR has no guaranteed price,
>   liquidity, or redemption.
> - BscScan source verification (planned after deploy) is **not** an audit.

## Spec (as implemented)

| Item | Value |
|---|---|
| Chain | BNB Smart Chain, chain ID 56 |
| NFT | ERC-721, name `OSSYREL Node`, symbol `OSSRN`, max supply **5,000** (global, all classes) |
| Reward token | BEP-20 `OSSYREL` (`OSR`), max supply **1,000,000,000** |
| OSR allocation | Reserve **300,000,000** (minted once at deploy to treasury/owner) + mining pool max **700,000,000** (minted only via claims) |
| Mint prices | STARTER **0 BNB**, BRONZE **0.0003**, SILVER **0.0007**, GOLD **0.0014**, DIAMOND **0.0042** |
| Classes (hash rate / shares) | STARTER 10 MH/s / 1, BRONZE 100 / 10, SILVER 250 / 25, GOLD 500 / 50, DIAMOND 1500 / 150 |
| STARTER limit | **1 per wallet**, forever (tracked even after transfer) |
| Era 1 reward | **10 OSR per share per day** |
| Halving | Each Era halves the rate (Era 2 = 5, Era 3 = 2.5, Era 4 = 1.25, …) |
| Era transition | Every **30 days** OR **150,000 new shares** minted in the Era — whichever first |
| Mint payments | All BNB forwarded immediately to the revenue (payout) address; the controller never holds funds |

## Contracts

| File | What it does |
|---|---|
| `contracts/OSSYRELNodeNFT.sol` | ERC-721 + Enumerable. Per-token class, hash rate, shares. Only `MINTER_ROLE` (MintController) can mint. `baseURI` changeable by owner. Calls the RewardController to settle rewards **before** every transfer (see below). |
| `contracts/OSSYRELMintController.sol` | Mint rules: fixed prices, global 5,000 cap, STARTER 1/wallet, BNB forwarding to revenue, pausable, `nonReentrant`. `agentMint()` for `AGENT_ROLE`. |
| `contracts/OSSYRELMiningEngine.sol` | Era + halving accounting. `advanceEra()` is permissionless and also auto-called on mint/claim. Exposes `currentEra`, `rewardPerSharePerDay(era)`, `canTransition()`, `nextEraAt()`, `sharesRemainingForEra()`, `eraStartTime(era)`. |
| `contracts/OSSYRELToken.sol` | ERC-20 + `ERC20Capped` (1B). Reserve minted once in the constructor. Only `MINTER_ROLE` (RewardController) can mint more. |
| `contracts/OSSYRELRewardController.sol` | Accrual, claiming, pool accounting, claim history, transfer settlement. |
| `contracts/mocks/` | Test-only contracts (`MockMiningEngine`, `MockNFT`, `ReentrancyAttacker`). Never deploy these. |

## Architecture

```
User ──BNB──> MintController ──mint──> NodeNFT ──settleTransfer──> RewardController
                  │  recordMint                │  (before ownership changes)
                  ▼                            ▼
            MiningEngine (Era)         RewardController ──mint OSR──> OSSYRELToken
                  ▲                            │  (only MINTER_ROLE, pool-capped)
                  └──── advanceEra() ──────────┘
```

### How Era is computed (deterministic)

- The Era clock starts at MiningEngine deployment (`eraStart`, Era 1).
- `advanceEra()` loops while a transition condition holds:
  - **Time trigger:** `block.timestamp >= eraStart + 30 days` → next Era starts at
    `eraStart + 30 days` (leftover time carries over), share counter resets.
  - **Shares trigger:** `sharesSinceEraStart >= 150,000` → next Era starts at
    `block.timestamp` (leftover shares carry over).
- Transitions depend only on `block.timestamp` and shares minted — never on a
  user opening a website. Anyone may call `advanceEra()`; minting and claiming
  call it automatically, so rewards always accrue on settled Era state.
- Each Era's start timestamp is recorded (`eraStartTime(era)`), so reward
  accrual can be walked era-by-era and halvings mid-period are exact.
- One Era can never last longer than 30 days, so one share can earn at most
  `10 × 30 × (1 + 1/2 + 1/4 + …) = 600 OSR` in its lifetime.

### How transfer settlement works

The NFT overrides `_update()`. **Before** ownership changes on any mint or
transfer, it calls `RewardController.settleTransfer(from, to, tokenId, shares)`:

1. The engine settles any due Era transition.
2. The **old owner** accrues rewards up to the transfer time with their old
   share balance; their checkpoint moves to now.
3. The **new owner** accrues up to the transfer time with their old share
   balance; their checkpoint moves to now.
4. Only then do the token's shares move from old owner to new owner.

Result: the old owner keeps exactly what they earned until the transfer; the
new owner earns only from the transfer onward. Nothing is earned twice,
nothing is lost. Only the wired NFT contract can call `settleTransfer()`.

### How claims are protected against double-claim

- Accrual is **checkpoint-based** (per owner, not per claim): `claim()` accrues
  to now, reads the pending balance, zeroes it **before** minting OSR
  (checks-effects-interactions), then mints. A second claim finds only rewards
  accrued after the first claim's block.
- Claims are `nonReentrant` and pausable. OSR minting itself has no callback,
  so there is no reentrancy path through the token.
- The mining pool is capped at 700,000,000 OSR (`minedTotal`). A claim larger
  than the remaining pool is paid **partially** up to the remainder; the unpaid
  rest stays pending and can never be paid once the pool is empty (`PoolEmpty`).
- Note: under the fixed spec the pool cap should never bind — max 750,000
  shares × max 600 OSR/share lifetime = **450,000,000 OSR < 700,000,000**.
  The cap is a safety bound, and it is tested with a mock engine at an
  extreme rate (see `test/04-rewards.test.js`).

### AGENT_ROLE — what it means here

`AGENT_ROLE` is an **admin-granted role for an automation address the owner
explicitly trusts** (for example the user's own paired agent / backend
worker). It may call:

- `MintController.agentMint(user, class)` — mint a Node **for** `user`, paying
  the BNB itself. The NFT goes to `user`, never to the agent.
- `RewardController.claimFor(user)` — claim **for** `user`. The OSR goes to
  `user`, never to the agent.

It is **NOT** an on-chain identity check: this code does **not** verify SPACE ID
Agent IDs or any external agent registry. If agent-only minting must be
enforced on-chain, a registry gate must be added and audited before launch.
No address holds `AGENT_ROLE` by default; the owner grants it after deploy.

## Roles

| Role | Held by (after deploy script) | Can do |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Deployer (owner) on every contract | Pause/unpause, grant/revoke roles, set revenue/baseURI/wiring |
| `MINTER_ROLE` (NFT) | MintController | Mint Node NFTs |
| `RECORDER_ROLE` (Engine) | MintController | Record minted shares (may trigger Era transition) |
| `MINTER_ROLE` (Token) | RewardController | Mint OSR on claim (cap-enforced) |
| `AGENT_ROLE` (Mint + Reward controllers) | Nobody by default | `agentMint()` / `claimFor()` on behalf of a user |

Planned owner/payout (to confirm with the user before deploy — **not** yet
deployed, no contract addresses exist):
- Owner/admin (deployer): `0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097` (My Wallet)
- Revenue/payout: `0x89c37649Ba3BAA9E1ce028612b7DE4e9c3a947B7` (Binance Agentic Wallet)

## Compile & test

```bash
cd contract
npm install
npx hardhat compile
npx hardhat test          # 39 tests, all passing (local Hardhat network)
```

Test coverage (`test/`): deployment/constants, mint prices, STARTER 1/wallet,
max supply 5,000 (real 5,000-mint run), metadata per class, hash/shares math,
Era time trigger (30d, 90d → Era 4) and shares trigger (exactly 150,000),
halving rates 10/5/2.5/1.25/0.625, accrual per time, accrual across halvings,
claim + history, anti double-claim, transfer settlement (single + partial),
`claimFor`/`agentMint` authorization, pause, unauthorized access on every
restricted function, OSR hard cap (1B), mining-pool cap (mock engine),
reentrancy attack on mint payment forwarding, no retroactive rewards.

> Test note: Hardhat mines one block per transaction (~1s apart), so
> time-based amounts carry a few seconds of drift. Tests assert exact values
> only for view calls taken right after a time jump, and use a small tolerance
> (0.01 OSR, 1000 OSR for the extreme-rate mock test) for claimed amounts.

## Deploy (later — NOT done in this stage)

```bash
cp .env.example .env   # fill in addresses; NEVER commit .env or a private key
npx hardhat run scripts/deploy.js --network localhost   # local test first
```

Mainnet deploy is refused by `scripts/deploy.js` unless
`CONFIRM_MAINNET_DEPLOY=true` is set — only after an independent security
review. The deployer must be the owner wallet (it pays gas in BNB and becomes
admin); mint revenue goes to the revenue address. Estimated deploy cost was
not measured here; fund the deployer with a small BNB buffer before deploying.

After deploy: verify each contract's source on BscScan (verification ≠ audit),
then grant `AGENT_ROLE` if an agent flow is used.

## Known limitations

- No independent audit. Do not treat passing tests as a security guarantee.
- `pendingReward()` (view) does not settle a due Era transition; it may lag
  slightly until the next mint/claim pokes the Era. Actual claims always poke
  first, so claimed amounts are exact.
- The Era clock starts at MiningEngine deployment, not at the first mint.
- `settleTransfer` is skipped while the NFT's RewardController is unwired
  (address zero) — wiring must happen before the first mint (the deploy
  script does this).
- Prices are fixed constants; changing them requires a new deployment.
- No per-wallet cap except STARTER (1/wallet); no burn function.
