# SponsorGuard

> **Automated influencer sponsorship compliance and multi-tranche escrow release on GenLayer.**

SponsorGuard provides trustless sponsorship escrow and continuing compliance enforcement for Web3 marketing teams and creator campaigns. A sponsor creates a campaign, defines content disclosure policies, and locks native GEN budget. The nominated creator deposits a 20% safety bond. When the creator submits their public content URL, GenLayer's multi-validator AI consensus evaluates baseline compliance, periodic content availability, and disclosure adherence on-chain, automatically releasing vesting tranches or slashing creator bonds upon policy violations.

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────────┐     ┌─────────────────────────┐
│  Sponsor Creates        │     │  Creator Accepts        │     │  GenLayer Consensus         │     │  On-Chain Settlement    │
│  Campaign & Budget      │     │  & Deposits 20% Bond    │     │                             │     │                         │
│ 1. Define Policy Text   │────>│ 1. Accept Campaign      │────>│ 1. Fetch URL via Web        │────>│ COMPLIANT: Release 1/3  │
│ 2. Lock GEN Budget      │     │ 2. Submit Content URL   │     │ 2. Evaluate Compliance LLM  │     │ WARNING: Hold Tranche   │
│ 3. Nominate Creator     │     │ 3. Trigger Baseline     │     │ 3. Verify Action Rules      │     │ VIOLATION: Slash Bond   │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────────┘     └─────────────────────────┘
```

---

## 1. The Problem

Web3 brands, DAOs, and marketing agencies spend millions on influencer sponsorships, but post-payment compliance management is severely broken:

- **Post-Payment Disclosure Drift:** Creators frequently remove required `#ad` / `#sponsored` disclosures, delete sponsored posts, or unlist video content shortly after receiving initial payments.
- **Inability of Traditional Contracts to Verify Media Content:** Standard EVM smart contracts (Solidity/Vyper) cannot inspect live social media URLs, verify video descriptions, or determine whether an influencer post violates sponsorship guidelines.
- **Unilateral Escrow Lockup or Manual Dispute Overhead:** Traditional escrow tools either lock funds unconditionally or require brand managers to manually inspect every post and handle subjective disputes off-chain.

---

## 2. How It Works

SponsorGuard replaces manual brand auditing with GenLayer's multi-validator AI consensus:

1. **Create Campaign:** A Sponsor calls `create_campaign`, nominating a Creator address, setting a 3-tranche native GEN budget, content deadline, recheck interval, and public disclosure policy text.
2. **Accept Campaign & Deposit Bond:** The nominated Creator calls `accept_campaign`, depositing a mandatory safety bond equal to **20% of the total budget**.
3. **Submit Content URL:** The Creator posts their sponsored content and calls `submit_content(campaign_id, content_url)`.
4. **Baseline & Periodic Recheck Consensus:** Anyone can trigger `verify_campaign` or `recheck_campaign`. The GenLayer leader node fetches the public URL via `gl.nondet.web.render` and evaluates content policy alignment using `gl.nondet.exec_prompt`.
5. **Deterministic Payout & Slashing:** GenLayer validator nodes re-evaluate content findings and enforce strict verdict action rules through `validator_fn`:
   - **`COMPLIANT` (`RELEASE`):** Unlocks the next 1/3 vesting tranche to the Creator.
   - **`WARNING` (`HOLD`):** Temporarily pauses tranche release due to minor disclosure gaps, allowing creator remediation within the recheck window.
   - **`MAJOR_VIOLATION` (`TERMINATE`):** Immediately terminates the campaign, slashes **50% of the Creator's safety bond** to the Sponsor, and refunds remaining unvested budget.
   - **`REMOVED` (`TERMINATE`):** If post is deleted or unlisted, slashes **100% of the Creator's safety bond** to the Sponsor and refunds unvested budget.

---

## 3. Why GenLayer Is Essential

SponsorGuard relies on native non-deterministic web fetching and multi-model consensus inside the smart contract state machine:

| Capability | EVM / Solidity | Centralized Oracles | GenLayer |
|---|---|---|---|
| Fetch live social media URLs on-chain | ❌ Impossible | ⚠️ Centralized / Trusted | ✅ Native `gl.nondet.web.render()` |
| Evaluate natural language policy rules | ❌ Impossible | ⚠️ Off-chain server bot | ✅ Native `gl.nondet.exec_prompt()` |
| Multi-validator AI consensus | ❌ Impossible | ❌ None | ✅ Built-in `run_nondet_unsafe` |
| Creator bond deposit & slashing logic | ⚠️ Complex multisig | ❌ Platform holds funds | ✅ Native state machine escrow |
| Automated multi-tranche vesting | ⚠️ Fixed time locks | ❌ Manual support desk | ✅ Dynamic verdict-driven vesting |

---

## 4. Live Deployment & Evidence

| Component | Network | Explorer / Address | Details |
|---|---|---|---|
| `sponsor_guard.py` | GenLayer Studionet (`61999`) | [`0x2012c18961Ba71Defb3de61eabCb87866938CC95`](https://explorer-studio.genlayer.com/address/0x2012c18961Ba71Defb3de61eabCb87866938CC95) | GenVM `v0.2.16` Intelligent Contract |
| Deployment Tx | GenLayer Studionet | [`0xaa536e421507497e483cd50e6b316bece714d8e52a04241dac34367427d53c54`](https://explorer-studio.genlayer.com/tx/0xaa536e421507497e483cd50e6b316bece714d8e52a04241dac34367427d53c54) | Status: `FINALIZED`, GenVM: `SUCCESS` |
| Web Application | Vercel Production | [sponsorguard-buildgenlayer.vercel.app](https://sponsorguard-buildgenlayer.vercel.app) | React + TypeScript dApp |
| Pytest Test Suite | Local Simulator | 18 Unit Tests Passing | Covers campaign creation, bond deposits, verdicts & slashing |

---

## 5. Intelligent Contract Architecture

### Storage Mappings (`contracts/sponsor_guard.py`)
```python
next_campaign_id: u256                          # Campaign ID counter
campaign_sponsor: TreeMap[u256, Address]        # Campaign ID -> Sponsor address
campaign_creator: TreeMap[u256, Address]        # Campaign ID -> Creator address
campaign_budget: TreeMap[u256, u256]           # Total budget in native GEN wei
campaign_bond: TreeMap[u256, u256]             # Required 20% creator safety bond
campaign_status: TreeMap[u256, str]             # OPEN | ACCEPTED | SUBMITTED | ACTIVE | COMPLETED | TERMINATED
campaign_content_url: TreeMap[u256, str]        # Public content URL submitted by creator
campaign_tranches_released: TreeMap[u256, u256] # Number of tranches released (0 to 3)
```

### API Reference

#### Write Methods
- **`create_campaign(creator: Address, policy: str, content_deadline: u256, recheck_interval: u256) -> u256`** `@gl.public.write.payable`
  - Locks total campaign budget in native GEN wei and initializes campaign in `OPEN` status.

- **`accept_campaign(campaign_id: u256)`** `@gl.public.write.payable`
  - Callable by designated `creator`. Requires exact **20% safety bond deposit**.

- **`submit_content(campaign_id: u256, content_url: str)`** `@gl.public.write`
  - Stores public content URL and updates status to `SUBMITTED`.

- **`verify_campaign(campaign_id: u256)`** `@gl.public.write`
  - Triggers baseline web fetch (`gl.nondet.web.render`) and LLM compliance check (`gl.nondet.exec_prompt`).

- **`recheck_campaign(campaign_id: u256)`** `@gl.public.write`
  - Triggers periodic recheck of active content URL after recheck interval timestamp.

- **`cancel_campaign(campaign_id: u256)`** `@gl.public.write`
  - Allows sponsor to cancel an `OPEN` (unaccepted) campaign with full budget refund.

#### View Methods
- **`get_campaign(campaign_id: u256) -> str`** `@gl.public.view`: Returns JSON representation of campaign state.
- **`get_campaign_count() -> u256`** `@gl.public.view`: Returns total count of campaigns created.

---

## 6. Development & Verification Guide

### Contract Lint & Pytest Suite
```bash
# 1. Run GenVM semantic lint check
python -m genvm_lint check contracts/sponsor_guard.py

# 2. Run unit test suite (18 tests)
pytest -v
```

### Frontend Development & Build
```bash
# Navigate to frontend directory
cd frontend

# Install node dependencies
npm install

# Run development server
npm run dev

# Verify production build
npm run build
```
