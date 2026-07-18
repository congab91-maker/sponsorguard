# SponsorGuard Intelligent Contract

SponsorGuard is a smart contract written for GenVM (GenLayer's execution layer) that automates sponsorship payments with decentralized AI evaluations of content policy alignment.

## Features

- **Multi-Tranche Escrow**: The sponsor funds a campaign budget that is split into three equal vesting tranches.
- **Creator Safety Deposit**: The creator must post a safety bond of exactly 20% of the total budget before accepting the campaign.
- **State Machine Routing**: Enforces linear lifecycle flow: `OPEN -> ACCEPTED -> SUBMITTED -> ACTIVE -> COMPLETED` with cancel and termination exceptions.
- **On-chain Web and AI Judgment**: Uses `gl.nondet.web.get` to fetch raw pages, and `gl.nondet.exec_prompt` to judge content. Consensus is reached using `gl.vm.run_nondet_unsafe` and custom semantic validation.
- **Bond Slashing**:
  - `MAJOR_VIOLATION`: 50% creator bond slashed and sent to the sponsor. Remaining budget refunded.
  - `REMOVED` or unreachable content: 100% creator bond slashed and sent to the sponsor. Remaining budget refunded.
- **Warning Holds**: Gaps in compliance pause payment release but permit subsequent remediation without slashing.

## Public Interface

### Public Writes
- `create_campaign(creator: Address, policy: str, content_deadline: u256, recheck_interval: u256) -> u256` (payable)
- `cancel_campaign(campaign_id: u256)`
- `accept_campaign(campaign_id: u256)` (payable)
- `submit_content(campaign_id: u256, content_url: str)`
- `evaluate_baseline(campaign_id: u256)`
- `request_recheck(campaign_id: u256)`

### Public Views
- `get_campaign(campaign_id: u256) -> str` (returns campaign attributes serialized as JSON)
- `get_check(campaign_id: u256, sequence: u256) -> str` (returns check results serialized as JSON)
- `get_campaign_count() -> u256`
