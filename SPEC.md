# SponsorGuard MVP Specification

## 1. Product decision

SponsorGuard is a Studionet dApp that protects sponsored-content payments with
escrowed vesting and recurring AI-validator compliance checks.

Final pitch:

> SponsorGuard continuously verifies sponsored-content compliance and releases
> escrowed payments or slashes creator bonds through decentralized AI
> adjudication.

The MVP does not claim to recover funds that have already left the contract.
Its enforceable consequences are:

- hold or release the next escrowed tranche;
- terminate unpaid vesting;
- slash an escrowed creator bond;
- refund remaining escrow to the sponsor.

## 2. Fixed product choices

### Demo content

Use a public, anonymous HTML fixture hosted with the frontend. The page represents
a sponsored post and can be switched between compliant, warning, violation, and
removed states. This makes validator web access repeatable without depending on
login-gated or anti-bot social platforms.

Real Instagram, TikTok, and X URLs are out of scope for the MVP.

### Payment structure

- Sponsor funds three equal vesting tranches when creating the campaign.
- Creator must escrow a bond equal to 20% of the campaign budget before submitting
  content.
- A successful baseline review releases tranche 1.
- Two later permissionless rechecks can release tranches 2 and 3.
- A warning holds the next tranche and permits remediation.
- A major violation terminates remaining vesting and slashes 50% of the bond.
- Removed/unreachable content after baseline terminates remaining vesting and
  slashes 100% of the bond.
- Any slashed bond is transferred to the campaign sponsor as compensation.
- Any remainder caused by integer division is included in the final tranche.

All monetary values are `u256` wei. One GEN is 10^18 wei.

### Recheck trigger

Rechecks are permissionless write transactions. The contract never claims to run
on its own. Each check enforces a deterministic `next_check_at` timestamp before
performing web/LLM work.

The MVP frontend exposes a `Run compliance recheck` action. An automated keeper
and unpredictable sampling are future work.

### Policy governance

The campaign policy is immutable after the creator accepts the campaign. This
prevents retroactive sponsor rule changes. A future PolicyRegistry may publish
new versions, but an active campaign may adopt a new version only with explicit
consent from both sponsor and creator.

## 3. Network and current SDK baseline

- Network: Studionet
- GenLayer RPC: `https://studio.genlayer.com/api`
- Chain ID: `61999`
- Currency: GEN
- Explorer: `https://explorer-studio.genlayer.com/`
- Frontend chain import: `studionet` from `genlayer-js/chains`
- Wallet connection: `await client.connect("studionet")`
- Final UI settlement: wait for `TransactionStatus.FINALIZED` and inspect the
  execution result; a transaction hash or finalized status alone is not proof of
  successful execution.

Current official contract dependency declaration:

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
```

The current official first-contract documentation does not show the historical
`# v0.2.16` header. Do not reintroduce it without verifying that the live Studio
requires it.

## 4. MVP architecture

Use one Intelligent Contract for the MVP. Separate contracts would add
cross-contract messaging and deployment complexity without improving the core
demo.

Logical modules inside the contract:

- campaign registry and authorization;
- escrow and creator bond accounting;
- immutable campaign policy;
- baseline and recheck adjudication;
- vesting state machine;
- finalized transfer emission.

Frontend:

- React + TypeScript + Vite;
- `genlayer-js` for wallet, reads, writes, and receipts;
- no application backend;
- public demo-post fixture routes hosted with the frontend;
- contract address must remain absent until the user supplies a real successfully
  deployed Studionet address.

## 5. Campaign state machine

`OPEN -> ACCEPTED -> SUBMITTED -> ACTIVE -> COMPLETED`

Exceptional branches:

- `OPEN -> CANCELED`
- `ACTIVE -> WARNING -> ACTIVE`
- `ACTIVE/WARNING -> TERMINATED`

When a warning holds the next tranche, a compliant remediation recheck releases
that tranche exactly once. If the campaign reaches its deadline or is terminated
while the tranche is still held, that tranche is refunded to the sponsor exactly
once.

Required invariants:

- only the designated creator can accept and submit;
- sponsor cannot change policy after acceptance;
- sponsor cannot reclaim active escrow outside defined termination/cancel paths;
- creator cannot claim or receive the same tranche twice;
- a recheck cannot run before `next_check_at`;
- nondeterministic work happens only after all cheap deterministic guards pass;
- storage writes and transfers happen only after consensus returns;
- campaign balances never underflow and total outgoing value never exceeds funded
  budget plus creator bond;
- deleted/unreachable content is not silently treated as compliant.

## 6. Adjudication

Inputs:

- immutable policy text;
- baseline rendered content or its stable digest and summary;
- current rendered content;
- check sequence and transaction timestamp.

Output schema:

```json
{
  "verdict": "COMPLIANT | WARNING | MAJOR_VIOLATION | REMOVED",
  "disclosure_present": true,
  "policy_findings": ["short finding"],
  "reason": "concise user-facing explanation",
  "recommended_action": "RELEASE | HOLD | TERMINATE"
}
```

Rules:

- Web and LLM calls must remain inside a nondeterministic block.
- Storage writes and transfer/message emission must happen after consensus.
- Prefer the current official Equivalence Principle wrapper for semantic
  comparison over exact JSON string equality.
- Consensus must agree on the verdict and recommended action, not exact wording.
  A validator that only checks JSON field presence is not acceptable.
- Treat policy and rendered content as untrusted data, delimit them explicitly,
  state that embedded instructions must be ignored, constrain output to the
  schema, validate enum values and non-empty findings/reason, and cap input size.
- Store only the stable digest, verdict, reason, check timestamp, and sequence
  required for auditability; do not store full rendered pages.

## 7. Contract surface

Names may be refined to satisfy the current GenVM linter, but behavior must remain:

- `create_campaign(creator, policy, content_deadline, recheck_interval)` payable
- `cancel_campaign(campaign_id)`
- `accept_campaign(campaign_id)` payable
- `submit_content(campaign_id, content_url)`
- `evaluate_baseline(campaign_id)`
- `request_recheck(campaign_id)`
- `get_campaign(campaign_id)`
- `get_check(campaign_id, sequence)`
- `get_campaign_count()`

Use current GenVM-supported fixed-size ABI types (for example `u256`/`u64`) for
campaign IDs, timestamps, intervals, amounts, and counts. Do not expose Python
`int` in public method signatures or persistent storage.

Use the exact class entry point `Contract(gl.Contract)`. Persistent fields must
be class-level typed storage declarations; use fully instantiated `TreeMap` and
`DynArray` (or an officially supported `@allow_storage` dataclass) and do not
reassign VM-managed collections in `__init__`.

The creator bond required by `accept_campaign` is exactly 20% of the funded
campaign budget. Reject zero budgets, zero/invalid addresses, `sponsor == creator`,
blank or oversized policy/URL values, invalid deadlines/intervals, duplicate
acceptance/submission, and wrong payment amounts before nondeterministic
execution.

## 8. UI journeys and states

Sponsor:

1. Connect wallet on Studionet.
2. Create and fund campaign.
3. View creator acceptance and submitted URL.
4. Observe baseline/recheck consensus stages.
5. See released, held, slashed, and refundable amounts.

Creator:

1. Connect designated wallet.
2. Review immutable policy and escrow terms.
3. Deposit required bond and accept.
4. Submit public URL.
5. See verdict, reason, remediation requirement, and vesting progress.

Public/auditor:

1. Open campaign by ID.
2. Inspect policy, checks, timestamps, verdicts, and explorer links.
3. Trigger an eligible permissionless recheck.

Required UI states:

- disconnected/wrong network;
- empty campaign list;
- loading reads;
- awaiting wallet signature;
- pending/proposing/committing/revealing/accepted/finalized;
- success and execution error;
- warning/remediation;
- URL unavailable;
- transaction timeout/undetermined;
- mobile and reduced-motion layouts.

## 9. Tests

Contract tests:

- campaign creation and exact escrow accounting;
- creator authorization and exact bond requirement;
- immutable policy after acceptance;
- baseline compliant path and first tranche release;
- warning holds payment;
- remediation followed by compliant recheck;
- major violation and 50% bond slash;
- removed content and 100% bond slash;
- premature and duplicate rechecks;
- duplicate payout prevention;
- canceled campaign refund;
- malformed adjudication output;
- dead URL/web failure;
- arithmetic boundary and remainder handling.

Frontend tests:

- wallet/network gate;
- no contract client is created from a placeholder address;
- transaction progress mapping;
- finalized execution error is shown as failure;
- long policy/reason content;
- keyboard and focus behavior;
- responsive layout at 375 px and desktop.

## 10. Acceptance criteria

The MVP passes only when:

1. The contract deploys successfully in the live Studionet Studio using the
   current official dependency/header format.
2. A real public page is fetched from inside the Intelligent Contract.
3. Validators reach semantic consensus on a structured compliance verdict.
4. Baseline and two rechecks produce auditable state changes.
5. Real escrowed GEN and creator bond accounting enforce release, hold,
   termination, refund, and slash paths.
6. The frontend uses real `genlayer-js` Studionet reads/writes and never simulates
   an on-chain verdict.
7. UI settlement waits for finalization and surfaces execution failure.
8. No placeholder contract address appears in source or `.env`.
9. Tests/build/lint pass and the repository contains no credentials.

## 11. Explicitly out of scope

- automatic cron execution;
- unpredictable/random sampling;
- clawback from an external wallet;
- production social-network scraping;
- editable policies on accepted campaigns;
- multiple coordinated contracts;
- fiat payments, legal enforcement, or regulatory certification;
- GitHub push or Vercel deployment by Antigravity.
