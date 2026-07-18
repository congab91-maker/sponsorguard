# SponsorGuard Blocker Correction Implementation Plan

We plan to resolve all P0/P1 blockers identified in the Codex review, focusing on transaction API integration, escrow locking scenarios, decimal precision for Wei, lint warnings, and workspace file structure.

---

## Proposed Changes

### P0-1 — Frontend Transaction API

#### [MODIFY] [App.tsx](file:///E:/Genlayer-Projects/sponsorguard/frontend/src/App.tsx)
- Replace any usage of `client.getTransactionReceipt` and `.status`/`.executionResult` with polling `client.getTransaction({ hash })` and checking the official genlayer-js 1.1.8 fields:
  - `statusName` (compares against `TransactionStatus` values)
  - `txExecutionResultName` (compares against `ExecutionResult.FINISHED_WITH_RETURN` and `ExecutionResult.FINISHED_WITH_ERROR`)
- Map transaction statuses to UI steps:
  - `PENDING` -> "pending"
  - `PROPOSING` -> "proposing"
  - `COMMITTING`, `APPEAL_COMMITTING` -> "committing"
  - `REVEALING`, `APPEAL_REVEALING` -> "revealing"
  - `ACCEPTED`, `READY_TO_FINALIZE` -> "accepted"
  - `FINALIZED` -> "finalized"
  - `CANCELED`, `VALIDATORS_TIMEOUT`, `LEADER_TIMEOUT` -> "error"
  - `UNDETERMINED` -> "pending"
- Implement polling timeout/retry logic: max 150 retries with a 2-second delay.
- Replace `client: any` type signature with `ReturnType<typeof createClient> | null`.
- Only call `fetchCampaignDataReal` upon successful on-chain finalization (`FINISHED_WITH_RETURN`).

#### [MODIFY] [App.test.tsx](file:///E:/Genlayer-Projects/sponsorguard/frontend/src/App.test.tsx)
- Mock the exact genlayer-js real API (`getTransaction` returning `statusName` and `txExecutionResultName`).
- Add a spy mock for `getTransactionReceipt` that throws an error, verifying it is never called.
- Add live-mode tests covering:
  - Successful finalization + state refresh.
  - Finalization execution failure (no state refresh + error banner).
  - Cancellation / timeout status aborts polling and raises errors.

---

### P0-2 — Escrow Locking Scenarios

#### [MODIFY] [sponsor_guard.py](file:///E:/Genlayer-Projects/sponsorguard/contracts/sponsor_guard.py)
- **`accept_campaign`**: Add deadline guard checking `get_now_timestamp() >= campaign_deadline[campaign_id]`. Reject before updating status or writing bond.
- **`submit_content`**: Add deadline guard checking `get_now_timestamp() >= campaign_deadline[campaign_id]`.
- **`settle_expired_campaign`**:
  - Allow permissionless settlement for `OPEN`, `ACCEPTED`, `SUBMITTED`, `ACTIVE`, and `WARNING` states.
  - Return allocations before emission of values, setting status to `COMPLETED` first.
  - Settle refunds as follows:
    - `OPEN`: Refund entire budget to Sponsor.
    - `ACCEPTED`: Refund entire budget to Sponsor; refund entire bond to Creator.
    - `SUBMITTED`: Refund entire budget to Sponsor; refund entire bond to Creator.
    - `ACTIVE/WARNING`: Refund unpaid budget to Sponsor; refund entire bond to Creator.
  - Retain the double-settlement guard.

#### [MODIFY] [test_sponsor_guard.py](file:///E:/Genlayer-Projects/sponsorguard/tests/test_sponsor_guard.py)
- Add mandatory unit tests for:
  - Expired `OPEN` campaign permissionless settlement.
  - Creator accept after deadline rejection.
  - Creator accept before deadline but fails to submit content; campaign settles budget to sponsor and bond to creator after deadline.
  - Content submission after deadline rejection.
  - `ACCEPTED` campaign settled after deadline without locked funds.
  - Verification that third-party caller can execute settlement.
  - Re-settlement rejection (double-settlement guard).

---

### P1-1 — Decimal Precision for Wei

#### [MODIFY] [App.tsx](file:///E:/Genlayer-Projects/sponsorguard/frontend/src/App.tsx)
- Import `parseEther` and `formatEther` from `viem` package.
- Compute campaign budget: `const budgetWei = parseEther(formBudget)`.
- Modify `Campaign` interface to store budget and bond as `string`:
  - `budget: string`
  - `bond: string`
- Update simulated campaigns and updates to use string decimals.
- Calculate bond amount precisely using BigInt math: `const bondWei = BigInt(campaign.budget) * 20n / 100n`.
- Render budget and bond values using `formatEther(BigInt(campaign.budget))` and `formatEther(BigInt(campaign.bond))`.

#### [MODIFY] [sponsor_guard.py](file:///E:/Genlayer-Projects/sponsorguard/contracts/sponsor_guard.py)
- Serialize `budget` and `bond` in `get_campaign()` to decimal strings using `str(budget)` and `str(bond)`.

#### [MODIFY] [test_sponsor_guard.py](file:///E:/Genlayer-Projects/sponsorguard/tests/test_sponsor_guard.py)
- Add tests verifying creation of decimal values (e.g. 1.1 GEN is exactly `1100000000000000000` wei, 1.234567890123456789 GEN maintains precision, and 20% creator bond checks match exactly on-chain).

---

### P1-2 — Lint Warnings

#### [MODIFY] [App.tsx](file:///E:/Genlayer-Projects/sponsorguard/frontend/src/App.tsx)
- Replace `catch (err: any)` with `catch` where `err` is unused (e.g. `fetchCampaignDetailsReal`).
- Import `useCallback` from `"react"`.
- Wrap `fetchCampaignDataReal` in `useCallback` with dependency array `[client]`. Include it in `useEffect` dependency array.

---

### P1-3 — Gitignore

#### [MODIFY] [.gitignore](file:///E:/Genlayer-Projects/sponsorguard/frontend/.gitignore)
- Append `.env`, `.env.*`, and `!.env.example` configurations.
- Verify `frontend/.env` is clean and contains no placeholder address.

---

### P2 — Workspace Artifact Reports

#### [NEW] [walkthrough.md](file:///E:/Genlayer-Projects/sponsorguard/walkthrough.md)
- Walkthrough report at project root.

#### [NEW] [task.md](file:///E:/Genlayer-Projects/sponsorguard/task.md)
- Checklist at project root tracking resolved tasks.

#### [NEW] [implementation_plan.md](file:///E:/Genlayer-Projects/sponsorguard/implementation_plan.md)
- Implementation plan copy at project root.

---

## Verification Plan

### Automated Tests
- Contract tests:
  `.\venv\Scripts\python.exe -m pytest tests -q`
- GenVM linter validation:
  `.\venv\Scripts\genvm-lint.exe validate contracts\sponsor_guard.py`
  `.\venv\Scripts\genvm-lint.exe check contracts\sponsor_guard.py`
  `.\venv\Scripts\genvm-lint.exe lint contracts\sponsor_guard.py`
- Frontend vitest suite:
  `npm run test:run`
- Frontend type and production bundle:
  `npm run build`
- Frontend linter checks:
  `npm run lint`

### Manual Verification
- Verify that `npm run lint` yields clean, warning-free outputs.
- Verify that no placeholder addresses are added to the source code.
