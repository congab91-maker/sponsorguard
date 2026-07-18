# SponsorGuard Blocker Correction Checklist

- [x] P0-2: Python Smart Contract Expiration & Settlement
  - [x] Implement deadline validation in `accept_campaign()`
  - [x] Implement deadline validation in `submit_content()`
  - [x] Rewrite `settle_expired_campaign()` to handle OPEN, ACCEPTED, SUBMITTED, ACTIVE, WARNING states permissionlessly
  - [x] Ensure state is locked to terminal `COMPLETED` before value transfers
  - [x] Serialize `budget` and `bond` as strings using `str(int(...))` in `get_campaign()`
  - [x] Write python unit tests for deadline actions, third-party callers, double settlement, and expiration math in `tests/test_sponsor_guard.py`

- [x] P0-1: Frontend Transaction API (genlayer-js 1.1.8)
  - [x] Define dynamic ClientType using `ReturnType<typeof createClient>`
  - [x] Implement `sendAndFinalizeTransaction` using `client.getTransaction` and `statusName`/`txExecutionResultName` checks
  - [x] Implement polling loop retry limit (max 150 retries) and timeout handling
  - [x] Support UI status updates mapping all official TransactionStatus values
  - [x] Handle undefined / non-RETURN execution results as errors
  - [x] Remove all usage of `getTransactionReceipt` and `"SUCCESS"` checks

- [x] P1-1: Decimal Precision for Wei & Frontend Type Updates
  - [x] Use `parseEther` and `formatEther` from `viem` in `App.tsx`
  - [x] Change `Campaign` interface properties `budget` and `bond` to `string` types
  - [x] Calculate creator bond precisely using BigInt integer math: `BigInt(campaign.budget) * 20n / 100n`
  - [x] Format displays using `formatEther` and configure mock fixtures with string decimals
  - [x] Remove fake wallet address `0xdc18aa3db8bc91a6e390a35e7d0811240F3ab001` from App.tsx runtime (use descriptive identifier like "Offline Sandbox Account")

- [x] Blocker & Integration Testing
  - [x] Add Vitest frontend tests in `frontend/src/App.test.tsx` verifying:
    - [x] Precision math (`parseEther` and BigInt bond calculations)
    - [x] Live transaction finalization + state refresh
    - [x] Live transaction execution error handling (no state refresh)
    - [x] Cancellation / failure state aborts polling and raises error
    - [x] Polling exhaustion timeout error handling
  - [x] Ensure Vitest mocks `getTransactionReceipt` to throw an error if called

- [x] Workspace Quality and Cleanliness
  - [x] Remove unused catch parameter warning from `App.tsx`
  - [x] Wrap fetch actions in `useCallback` and list all dependencies properly to eliminate React Hook dependencies warning
  - [x] Confirm `frontend/.gitignore` ignores `.env` and `.env.*` while keeping `.env.example`
  - [x] Run Pytest contract tests and GenVM validations
  - [x] Run frontend Vitest, linting, and production build checks
  - [x] Update `walkthrough.md` with actual execution logs and verification metrics
