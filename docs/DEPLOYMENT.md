# OSSYREL — THE HASH LEDGER: Deployment Guide (for later)

> **Status: planning document only. DO NOT deploy now.**
> There is no funding for deployment at the time of writing
> (owner and revenue wallet balances are far below one mint + gas —
> see §1), and no independent security review has been done.
> Real reward distribution MUST NOT be activated before an
> independent security review.

## 1. Prerequisites (all must be true before starting)

- [ ] User confirms the owner / revenue wallet roles:
  - Owner (deployer, contract owner): My Wallet
    `0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097`
  - Revenue / payout: Binance Agentic Wallet
    `0x89c37649Ba3BAA9E1ce028612b7DE4e9c3a947B7`
- [ ] **BNB funds available.** The deployer wallet needs enough BNB
  for: 5 contract deployments + BscScan verification is free, plus
  mint-activation and wiring transactions, plus a safety margin.
  **Current balances are insufficient** — as of 4 Nov 2026 the
  owner wallet holds ~0.000152 BNB and the Agentic Wallet
  ~0.000156 BNB, not enough for even one mint + gas. Do not start
  deployment until the owner wallet is funded (a ~0.01 BNB buffer
  is a reasonable planning figure; confirm actual gas costs at
  deploy time).
- [ ] Owner signature available: every deploy and activation step
  requires a signature from the owner's own wallet. Muse cannot
  sign and will never ask for a seed phrase or private key.
- [ ] Stage 3 contracts complete with passing Hardhat tests
  (including Era-transition, transfer-settlement, and
  double-claim tests).
- [ ] Independent security review completed, findings addressed.
- [ ] Collection metadata + site ready (Stage 2), baseURI decided.
- [ ] User decision on the TOKENOMICS.md recommendations (Era floor
  / rate floor, etc.) — or explicit confirmation to keep the spec
  as-is. This decision changes contract code and must come
  **before** deployment, because the contracts are immutable.

## 2. Deploy Order (Hardhat, BNB Mainnet — chain ID 56)

Deploy in this order; each step depends on the previous addresses.

1. **OSSYRELToken (OSR)** — deploy with max supply 1,000,000,000.
   Mint 300,000,000 OSR (reserve) to the reserve wallet at deploy.
   Mining allocation (700,000,000) is minted later, on demand, by
   the RewardController only.
2. **OSSYRELNodeNFT** — deploy with max supply 5,000, class table,
   and the MintController address as the authorised minter
   (set after step 3, or pass in constructor if the design allows).
3. **OSSYRELMintController** — deploy with NodeNFT address,
   revenue wallet, class prices, and mint-active = false.
4. **OSSYRELMiningEngine** — deploy with NodeNFT address and Era
   parameters (Era 1 rate 10 OSR/share/day, 30 days, 150,000-share
   trigger, genesis = deployment timestamp).
5. **OSSYRELRewardController** — deploy with MiningEngine + OSR
   addresses and the 700,000,000 OSR pool cap.
6. **Wire the contracts together:** grant the RewardController the
   OSR minter role; grant the MiningEngine the NodeNFT transfer-hook
   role; confirm the MintController is the sole minter of NodeNFT.
7. **Verify on BscScan** — verify the source of all five contracts
   (`npx hardhat verify --network bsc <address> <constructor args>`)
   and confirm "Pass - Verified" for each. Record the verification
   links.
8. **Sanity-check on-chain (read-only):** `MAX_SUPPLY`, class table,
   Era parameters, pool cap, owner, revenue wallet — all must match
   the spec exactly before activation.

## 3. Wiring Addresses into the Site

- Copy the five deployed contract addresses into the site config
  (Stage 2 site) — NodeNFT, MintController, MiningEngine,
  RewardController, OSR token.
- Update `llms.txt` / mint page with the live contract addresses
  and the agent mint prompt.
- Confirm the site reads live on-chain state (totalSupply,
  current Era, current rate) rather than hardcoded values.

## 4. Activating Mint

1. Owner calls `setMintActive(true)` on the MintController
   (owner signature required).
2. Verify on-chain: `mintActive == true`, `totalSupply == 0`.
3. Confirm the site shows MINT IS LIVE with correct stats.
4. **Test mint first** (one low-value mint, e.g. BRONZE) and verify
   end-to-end: NFT received, shares registered, pending reward
   accrues, claim works, transfer settles the old owner's reward.
   Only then announce the launch publicly.

## 5. Activating Rewards

- Rewards accrue automatically from the moment a Node is minted
  (Era Engine is deterministic; no activation step).
- **Claims (real OSR distribution) must NOT be enabled before the
  independent security review is complete.** If the RewardController
  is deployed with claiming live, that is a launch decision the
  user must make explicitly after the review.

## 6. Rollback / Failure Notes

- Contracts are immutable: a bug found after deployment cannot be
  patched in place. The only fix is a new deployment (new
  addresses, new collection) — which is why the testnet test and
  security review in §1 are mandatory, not optional.
- If a deploy transaction fails (out of gas, wrong network), do not
  retry blindly: check the revert reason, the deployer balance,
  and the network (must be BNB Mainnet, chain ID 56) first.
- Never paste a seed phrase, private key, or API key into chat,
  a script, or a config file. Deploy with the owner's own wallet
  (hardware wallet / wallet app) or the project's normal deploy
  flow — the same rule as the sibling collections.

---

*Planning document. No contract address, transaction hash, or live
statistic exists yet — do not invent any.*
