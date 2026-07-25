# Project Roadmap

## V1 Delivered

SponsorGuard V1 is a GenLayer Studionet proof of concept for sponsorship escrow and continuing influencer-content compliance. It addresses a specific post-payment risk: a creator may remove a sponsorship disclosure, delete the sponsored post, or allow the content to drift outside the sponsor's stated policy after funds have begun to vest.

The current product supports three user journeys:

- A sponsor can create and fund a campaign in native GEN, nominate a creator, define a public-content policy and deadline, inspect the campaign, and cancel an unaccepted campaign.
- The nominated creator can accept the campaign by posting a 20% safety bond, submit a public content URL, and request the baseline evaluation.
- Any participant or public auditor can inspect campaign and check history, request a time-gated recheck, and permissionlessly settle an expired campaign.

The Intelligent Contract is the adjudication and escrow layer. It fetches the submitted public URL, asks validators to classify the content as `COMPLIANT`, `WARNING`, `MAJOR_VIOLATION`, or `REMOVED`, and independently re-runs the evaluation during validation. Consensus is based on the decision-critical verdict and recommended action rather than identical explanatory wording. The resulting state transition can release the next vesting tranche, hold funds, terminate the campaign, refund unpaid funds, or slash part or all of the creator's bond. Baseline and recheck calls are manual and permissionless; no automated keeper is included in V1.

The React and TypeScript frontend is connected to the deployed Studionet contract through `genlayer-js`. It supports wallet discovery, exact native-token input using integer wei conversion, contract reads and writes, transaction polling through GenLayer consensus states, explicit execution-result checks, and separate Sponsor, Creator, and Public Auditor views. An explicitly labeled offline sandbox is also available for demonstrations; its simulated outcomes are not represented as on-chain results.

### Verified delivery evidence

- Source repository: [congab91-maker/sponsorguard](https://github.com/congab91-maker/sponsorguard)
- Live web application: [SponsorGuard on Vercel](https://sponsorguard-buildgenlayer.vercel.app)
- Reviewer screenshot: [`docs/sponsorguard-live.png`](docs/sponsorguard-live.png), captured from the public live-mode interface after wallet-compatibility release `c2ae2d0`; it is UI evidence, not campaign-transaction evidence.
- Studionet contract: [`0x2012c18961Ba71Defb3de61eabCb87866938CC95`](https://explorer-studio.genlayer.com/address/0x2012c18961Ba71Defb3de61eabCb87866938CC95)
- Deployment transaction: [`0xaa536e421507497e483cd50e6b316bece714d8e52a04241dac34367427d53c54`](https://explorer-studio.genlayer.com/tx/0xaa536e421507497e483cd50e6b316bece714d8e52a04241dac34367427d53c54), finalized successfully on Studionet
- Completed Studionet smoke campaign: Campaign `#1` escrowed `0.03 GEN`, accepted a `0.006 GEN` bond, stored three `COMPLIANT` / `RELEASE` adjudications, released all three tranches, returned the creator bond, and reached `COMPLETED`. Explorer evidence: [create](https://explorer-studio.genlayer.com/tx/0xb147d179d337e4b29961c62ef52da6f9d8c7d24d8f0d1d0c778299c30f5fba83), [accept](https://explorer-studio.genlayer.com/tx/0x875008b3037697a3df165993adf7dcf2dc0c875f95070251a70d25514f0a3364), [submit](https://explorer-studio.genlayer.com/tx/0x8f65ef577af1d883a7e5e89cc2d89717f6156d79ebf844440fb924de5ca1c798), [baseline](https://explorer-studio.genlayer.com/tx/0xd90dcc0d9fe36b43ffb4c0d2100063fd1d7cee68497cf967b1e5d056b4ab92ef), [recheck 1](https://explorer-studio.genlayer.com/tx/0x07638dac28f427e16bb4d243ac084256e2c8113c0a74f6a8b45052aed7542ecd), and [recheck 2](https://explorer-studio.genlayer.com/tx/0x664e29460083cdd448ea0527a2e019ba8a3c6744a7020bf6b257be1bfac69519).
- Network: GenLayer Studionet, chain ID `61999`, using the official Studio RPC documented in [Networks & RPCs](https://docs.genlayer.com/developers/networks)
- Contract verification: GenVM lint, validation, and check commands pass; the validator reports 10 public methods (7 write and 3 view).
- Contract tests: 18 of 18 tests pass locally.
- Frontend verification: 16 of 16 Vitest tests and Oxlint pass, and the production build succeeds. Coverage includes an OKX-shaped EIP-1193 provider, Studionet addition/switching, safe recovery from a rejected connection, normalized and raw Studionet execution-result schemas, and audit-history synchronization after rechecks.
- Deployment verification: the production domain `sponsorguard-buildgenlayer.vercel.app` returns successfully and displays the exact Studionet contract address. The deployment account or team is not asserted here because it is not public application evidence.
- Demo fixtures: compliant, warning, violation, and removed-content HTML fixtures are publicly reachable for sandbox demonstrations.

### Verified V1 limitations

- One operator-run compliant smoke campaign is verified on Studionet. This demonstrates the live path but is not evidence of production reliability, adverse-verdict handling on the deployed contract, external adoption, or repeat usage.
- The test suites use mocked web, LLM, VM, and frontend SDK behavior. There is no automated end-to-end test against the deployed Studionet contract.
- Rechecks require manual transactions. There is no keeper, scheduler, randomized monitoring window, notification service, or retry service.
- Studionet is a temporary development network. The current address and state should not be treated as a permanent production deployment.
- The contract records verdicts, findings, reasons, actions, and timestamps, but it does not preserve a content snapshot or content hash for later evidence comparison.
- The public-content fetch is unauthenticated. Private posts, login-gated pages, anti-bot pages, and platform-specific rendering are not supported reliably.
- The removed-content fixture contains a “404 Not Found” page but returns HTTP 200. The offline sandbox labels it as removed; a live contract evaluation would still depend on the validators interpreting the returned page.
- The deployed live-mode interface hides offline fixture controls and displays the verified Studionet contract address. Sandbox fixtures remain available only after the user explicitly enables offline simulation.
- Reviewer-facing root, frontend, contract, and roadmap documentation is public and matches the released source, current API, transaction-finality behavior, and stated limitations.
- There is no versioned deployment script in the repository. Vercel build configuration is maintained in the linked Vercel project.
- The frontend production bundle reports a JavaScript chunk above Vite's default 500 kB warning threshold.
- No verified external users, partnerships, testimonials, traction, or product analytics are currently available. Campaign `#1` is an operator-run smoke test and is not counted as adoption.

## Target Users

The initial target users are Web3 brands, marketing teams, creator managers, agencies, and DAO growth teams that sponsor public creator content and need transparent enforcement after the first payment. Their operational problem is not only whether a disclosure existed at submission, but whether the post remains accessible and compliant throughout the paid campaign.

Creators are also a target stakeholder. A deterministic escrow schedule, explicit policy, visible check history, and validator consensus can provide clearer payment conditions than an opaque sponsor-controlled review process. Public auditors, community contributors, and campaign stakeholders can use the read-only views and permissionless triggers to verify that the same contract rules apply to both parties.

The strongest initial use case is a small, public, fixed-duration sponsorship with a clearly written policy, a public URL, and staged payment. SponsorGuard is valuable in this setting because it combines transparent fund custody with contextual evaluation that cannot be reduced to a single hashtag check.

## Adoption Approach

SponsorGuard does not yet have verified users or an established community. The following is an adoption plan, not a statement of current traction.

1. **Reach relevant early communities.** Present the project to GenLayer builders, Web3 marketing operators, creator-economy communities, DAO growth teams, and agencies already comfortable with wallet-based payments. Use the public repository, live read-only interface, Explorer record, and a short recorded campaign walkthrough as the primary evidence.
2. **Offer a controlled Studionet demo.** Guide participants through sponsor funding, creator acceptance, URL submission, baseline evaluation, recheck, and settlement using test funds and a genuinely public demo page. Clearly separate offline sandbox results from on-chain consensus.
3. **Run narrowly scoped pilots.** Invite a small number of teams to model real campaign policies on Studionet without representing the network or funds as production-ready. Collect structured feedback on policy clarity, wallet friction, verdict usefulness, latency, and failed URL retrieval.
4. **Convert trials into repeated use.** Prioritize reusable policy templates, monitoring reminders, campaign history, and evidence export only after pilots demonstrate that users repeat the workflow. Continued use should be measured from verifiable campaign activity and opt-in product analytics, not anecdotal claims.
5. **Publish evidence-based learnings.** Share aggregate test outcomes, retrieval failure categories, consensus behavior, and contract-transaction links while protecting user and creator privacy.

## Planned Integrations

All integrations below are proposals. None should be interpreted as completed or partnered.

### Authenticated social-platform data sources

- **Why needed:** Public HTML retrieval can fail on JavaScript-heavy, login-gated, rate-limited, or anti-bot pages.
- **Value:** More reliable access to post text, disclosure labels, edit state, deletion state, and publication metadata.
- **Architecture impact:** Add an adapter layer for platform APIs or approved data providers, normalize retrieved evidence, and distinguish authoritative API results from raw web rendering.
- **Conditions:** Platform terms, API credentials, data-retention rules, creator consent, rate limits, cost, and a secure method of supplying off-chain credentials without exposing them to the contract.

### Durable evidence storage and content hashing

- **Why needed:** The current contract stores adjudication results but not complete before-and-after content evidence.
- **Value:** Auditable proof of what validators evaluated, clearer dispute review, and stronger temporal comparison.
- **Architecture impact:** Store canonical content hashes on-chain and place bounded snapshots or evidence packages in IPFS, Arweave, or another durable content-addressed store.
- **Conditions:** Privacy review, copyright and deletion policy, deterministic canonicalization, storage-cost analysis, and availability guarantees.

### Automation and notification services

- **Why needed:** V1 depends on users manually triggering rechecks and settlement.
- **Value:** Timelier monitoring, reduced missed checks, and faster remediation for both sponsor and creator.
- **Architecture impact:** Introduce an idempotent scheduler or keeper, randomized check windows where appropriate, transaction funding, retry logic, and email, webhook, or community-channel notifications.
- **Conditions:** Sustainable trigger economics, rate-limit controls, duplicate-call protection, monitoring, and security review of the automation account or network.

### Versioned policy and regulatory sources

- **Why needed:** Brand policies and disclosure guidance change over time.
- **Value:** Each verdict can reference the exact policy version in force, while campaigns can explicitly choose whether later amendments apply.
- **Architecture impact:** Add a versioned policy registry and optional references to authoritative advertising guidance such as FTC or ASA publications; preserve the policy version used by every check.
- **Conditions:** Clear update authority, immutable historical versions, jurisdiction selection, source availability, and legal review. SponsorGuard would provide workflow enforcement, not legal advice.

### Wallet and transaction-experience improvements

- **Why needed:** Multi-stage GenLayer transactions and wallet funding can be unfamiliar to first-time users.
- **Value:** Fewer abandoned flows, clearer transaction recovery, and more reliable account/network selection.
- **Architecture impact:** V1 now performs standard EIP-1193 account discovery and Studionet chain switching for OKX and injected browser wallets. Future work can add an EIP-6963 wallet chooser, account/chain change listeners, resumable transaction status, richer error categorization, and transaction-history links.
- **Conditions:** Real-device compatibility testing across supported wallet versions, stable SDK/provider APIs, and explicit UX for choosing among multiple simultaneously injected wallets.

### Indexing, analytics, and observability

- **Why needed:** Direct contract reads are sufficient for the MVP but do not provide portfolio search, funnel measurement, reliability alerts, or aggregate campaign reporting.
- **Value:** Faster dashboards, measurable adoption, failure diagnosis, and operational monitoring.
- **Architecture impact:** Index contract events or state changes, add privacy-conscious opt-in product analytics, and monitor RPC, fetch, consensus, and frontend health.
- **Conditions:** A defined event/indexing strategy, privacy policy, retention limits, and metrics that can be reconciled with Explorer data.

### Continuous integration and release tooling

- **Why needed:** Current verification is manual and is not enforced by continuous integration.
- **Value:** Reproducible evidence for every commit and safer contract/frontend releases.
- **Architecture impact:** Add GitHub Actions or equivalent for GenVM lint/validation/check, Python tests, frontend tests, lint, build, dependency review, and deployment smoke tests.
- **Conditions:** Stable CI-compatible GenLayer tooling, pinned runtime versions, protected secrets, and documented release gates.

### Optional token or stable-value escrow

- **Why needed:** Native GEN may not match the accounting preference of every sponsor.
- **Value:** Campaign budgets could use an agreed token denomination and reduce exposure to payment-asset volatility.
- **Architecture impact:** Add explicitly supported asset contracts, allowance and transfer handling, decimal-safe accounting, and asset-specific escrow invariants.
- **Conditions:** Confirmed GenLayer/EVM interoperability patterns, supported token contracts, independent security review, and a migration plan. Protocol validator staking described in the GenLayer staking guide is separate from SponsorGuard's application-level creator bond and is not integrated in V1.

## Success Metrics

Current evidence and future targets are deliberately separated. Future targets are initial pilot goals and may be revised after measured usage.

| Metric | Current evidence | Future target | Measurement method |
| --- | --- | --- | --- |
| Contract verification | GenVM lint, validation, and check pass; 18/18 local contract tests pass | Three consecutive CI runs passing all contract gates before each tagged release | CI artifacts containing tool versions, command output, and commit SHA |
| Frontend quality gate | Build and Oxlint pass; 16/16 Vitest tests pass locally | The full frontend gate passes in at least three consecutive CI runs | CI test reports and build artifacts |
| Deployment availability | Vercel production deployment is `Ready`; the live page returned successfully during the smoke check | At least 99% measured demo availability during a defined 30-day pilot window | External uptime monitor with timestamped results |
| Application-level contract activity | Campaign `#1` provides six successful application writes covering create, accept, submit, baseline, and two rechecks | At least 20 successful pilot write transactions across at least 10 test campaigns | Explorer/RPC transaction records grouped by contract method and campaign |
| Write-transaction success rate | The documented smoke sequence has six successful writes, but one controlled sequence is too small to claim a reliability rate | At least 95% of user-submitted pilot writes finalize successfully, excluding explicit user rejection | Compare initiated transaction telemetry with finalized execution results and Explorer records |
| Full-flow completion | One operator-run campaign reached `COMPLETED` with 3/3 checks and 3/3 tranches released | At least 80% of funded pilot campaigns reach a documented terminal state without operator repair | Indexed campaign state transitions, reconciled with contract reads |
| Compliance-check timeliness | Manual trigger behavior is implemented; no live timing dataset exists | At least 95% of scheduled pilot checks are triggered inside the intended monitoring window after automation is introduced | Scheduler logs reconciled with on-chain check timestamps |
| Retrieval reliability | Four demo fixture URLs respond, but the removed fixture returns HTTP 200 | At least 95% successful retrieval for explicitly supported public sources; failures must have a categorized reason | Instrumented retrieval outcomes by source type and HTTP/rendering result |
| Consensus outcome quality | Unit tests cover agreement and disagreement; no labeled live evaluation set exists | Review a consented, labeled pilot set and document disagreement, false-positive, and indeterminate rates before production use | Human-reviewed evaluation dataset linked to anonymized check outputs |
| Adoption | No verified users, active communities, or recurring campaigns | Three sponsoring teams complete at least one Studionet pilot, with at least one team running a second campaign | Opt-in team records plus verified contract activity; wallet count alone is not treated as a user count |
| Active integrations | V1 uses Studionet, `genlayer-js`, Vercel, and public web retrieval; no external platform API is integrated | Two production-ready external integrations that pass documented reliability and security gates | Integration health checks, contract tests, and release documentation |
| Frontend performance | Production build succeeds; the main JavaScript chunk is approximately 605 kB and triggers Vite's size warning | Bring the main initial chunk below 500 kB or meet a documented real-user performance budget | Versioned bundle analysis and browser performance measurements |

## Future Updates

### Phase V1.1 — Release Evidence and Reliability

- **Problem:** Local quality gates, reviewer documentation, and one completed live campaign are verified, but there is no CI enforcement, contract deployment is not scripted, and the smoke flow is still manually executed.
- **User value:** Judges and pilot users receive reproducible setup instructions, clearer product identity, trustworthy test evidence, and a demonstrably working on-chain journey.
- **Planned changes:** Add CI; add a reproducible Studionet contract-deployment runbook or script; make the removed fixture return a genuine failure state or use an explicit retrieval mock; and document a repeatable release smoke procedure that reconciles contract state with Explorer transactions.
- **Related integrations:** GitHub Actions or equivalent, GenVM tooling, Vercel, Studionet RPC, and Explorer.
- **Conditions:** Source changes must be separately approved; funded test wallets, public test content, stable SDK/tool versions, and permission to create application-level transactions are required.
- **Success metrics:** 18/18 contract tests and 16/16 frontend tests pass in three consecutive CI runs; all release documents match the public API; every release smoke run records the relevant Explorer transactions and terminal contract state.

### Phase V1.2 — Automated Compliance Monitoring

- **Problem:** Manual rechecks can be missed or predictably timed, weakening continuous monitoring.
- **User value:** Sponsors and creators receive timely, consistent checks without relying on a person to submit every transaction.
- **Planned changes:** Add an idempotent scheduler or keeper, bounded randomized check windows, retry and backoff behavior, trigger funding, duplicate protection, and notifications for warnings, termination, and settlement.
- **Related integrations:** Keeper or scheduler infrastructure, RPC monitoring, and email, webhook, or community-notification providers.
- **Conditions:** A sustainable fee model, automation-key security, rate-limit analysis, and contract-level idempotency tests are required.
- **Success metrics:** At least 95% of pilot checks occur within the defined window, at least 95% of submitted trigger transactions finalize successfully, and no campaign records duplicate check sequences.

### Phase V1.3 — Evidence-Grade Content and Policy

- **Problem:** Raw public retrieval is fragile, historical content is not preserved, and policy changes are not versioned per adjudication.
- **User value:** Each decision becomes easier to audit, explain, and dispute using the exact evidence and policy version evaluated.
- **Planned changes:** Canonicalize and hash retrieved content; preserve bounded evidence snapshots; add source adapters and explicit retrieval-failure classifications; introduce a versioned policy registry; associate every check with its content hash, source metadata, and policy version.
- **Related integrations:** Approved social-platform APIs or data providers, IPFS/Arweave or equivalent storage, and authoritative policy sources.
- **Conditions:** Platform permissions, privacy and copyright review, content-retention rules, storage-cost limits, and deterministic canonicalization are required.
- **Success metrics:** Evidence metadata is present for 100% of supported-source checks; supported-source retrieval succeeds at least 95% of the time; every verdict references an immutable policy version; retrieval failures are categorized rather than silently adjudicated.

### Phase V2 — Campaign Portfolio, Appeals, and Asset Expansion

- **Problem:** V1 is optimized for individual campaigns and has no structured appeal process, reusable portfolio operations, or alternative payment assets.
- **User value:** Agencies and recurring sponsors can manage campaigns efficiently, creators can request transparent review, and approved assets can match commercial accounting needs.
- **Planned changes:** Add reusable policy templates, multi-campaign portfolio views, role-based agency workflows, evidence export, an appeal and re-evaluation state machine, and—only if supported safely—token or stable-value escrow.
- **Related integrations:** Indexing and analytics, identity or role-management tools, notification providers, and audited token contracts.
- **Conditions:** Measured pilot demand, contract architecture and migration review, formal security assessment, supported asset standards, and explicit appeal-governance rules are required.
- **Success metrics:** At least three pilot teams use portfolio features; repeat-campaign creation time decreases against the V1 baseline; appeal outcomes and resolution time are measurable; automated asset-accounting invariant tests pass with no unexplained balance difference.

### Phase V2.1 — Production-Network Readiness

- **Problem:** Studionet is temporary and is not a durable production environment.
- **User value:** Campaigns can rely on a documented deployment, operational monitoring, controlled upgrades, and stronger fund-safety evidence.
- **Planned changes:** Reassess the current official GenLayer network options; perform an independent contract security review; define migration and pause procedures; pin build artifacts; deploy to the appropriate persistent network; verify the new address and full application flow; add operational dashboards and incident response.
- **Related integrations:** The selected GenLayer network and Explorer, CI/CD, monitoring, alerting, and audited data/asset integrations.
- **Conditions:** Official network readiness, stable SDK and RPC behavior, security-review completion, successful load and end-to-end tests, a new verified contract address, and explicit deployment approval are required.
- **Success metrics:** Reproducible byte-for-byte release artifacts, verified contract source and address, 100% balance-accounting invariants in pre-release tests, successful end-to-end flows, and defined uptime and incident-response measurements for the launch period.
