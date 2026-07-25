# SponsorGuard Intelligent Contract

`sponsor_guard.py` implements a native-GEN campaign escrow whose release schedule depends on repeated GenLayer web-and-LLM adjudication of a creator's public post.

## Public interface

### Write methods

```text
create_campaign(creator: Address, policy: str, content_deadline: u256, recheck_interval: u256) -> u256  [payable]
cancel_campaign(campaign_id: u256) -> None
accept_campaign(campaign_id: u256) -> None  [payable]
submit_content(campaign_id: u256, content_url: str) -> None
evaluate_baseline(campaign_id: u256) -> None
request_recheck(campaign_id: u256) -> None
settle_expired_campaign(campaign_id: u256) -> None
```

### View methods

```text
get_campaign(campaign_id: u256) -> str
get_check(campaign_id: u256, sequence: u256) -> str
get_campaign_count() -> u256
```

`get_campaign` and `get_check` return serialized JSON.

## Lifecycle

```text
OPEN -> ACCEPTED -> SUBMITTED -> EVALUATING -> ACTIVE/WARNING -> COMPLETED/TERMINATED
  \-> CANCELED
```

- `create_campaign` locks the payable sponsor budget. The creator must be nonzero and different from the sponsor; the policy is nonempty and at most 5,000 characters; the deadline must be in the future; and the recheck interval must be positive.
- `accept_campaign` is restricted to the named creator and requires a bond equal to exactly 20% of the budget.
- `submit_content` is restricted to that creator and accepts a nonempty string before the deadline. Operationally it must identify a publicly retrievable HTTP/HTTPS page, but the contract does not enforce a URL scheme at submission.
- `evaluate_baseline` is permissionless, valid only from `SUBMITTED`, and creates check sequence 1 before the deadline.
- `request_recheck` is permissionless from `ACTIVE` or `WARNING`, after `next_check_at`, before the deadline, and while fewer than three total checks exist.
- `settle_expired_campaign` is permissionless after the deadline for `OPEN`, `ACCEPTED`, `SUBMITTED`, `ACTIVE`, or `WARNING`; it refunds unpaid budget, returns any remaining bond, and prevents double settlement.
- An `OPEN` campaign can be canceled only by its sponsor, refunding its full budget.

`EVALUATING` is a transient reentrancy guard. If the nondeterministic evaluation throws, baseline evaluation restores `SUBMITTED`; a failed recheck restores its previous `ACTIVE` or `WARNING` state.

## Adjudication and consensus

The contract retrieves the submitted page with `gl.nondet.web.get`. A non-200 response maps to `REMOVED`; a successful response is decoded and capped at 30,000 characters. The LLM receives the policy, page content, and explicit instructions to treat retrieved text as untrusted data.

The leader must return exactly one JSON object with:

```json
{
  "verdict": "COMPLIANT | WARNING | MAJOR_VIOLATION | REMOVED",
  "disclosure_present": true,
  "policy_findings": ["nonempty finding"],
  "reason": "nonempty explanation of at most 500 characters",
  "recommended_action": "RELEASE | HOLD | TERMINATE"
}
```

Schema, enum, length, and verdict/action-coherence checks are supplemental guards. The validator independently reruns the same fetch-and-evaluation task and accepts only when its `verdict` and `recommended_action` match the leader. The reason and findings may differ.

## Escrow consequences

The budget is split into three integer tranches: the first two use `floor(budget / 3)` and the third receives the remainder.

| Verdict | Action | Consequence |
| --- | --- | --- |
| `COMPLIANT` | `RELEASE` | Release the next unpaid tranche; set `ACTIVE`; complete at sequence 3 and return the remaining bond. |
| `WARNING` | `HOLD` | Release nothing; set `WARNING`; at sequence 3, refund all unpaid/held budget and return the bond. |
| `MAJOR_VIOLATION` | `TERMINATE` | Refund unpaid budget; transfer 50% of the bond to the sponsor and 50% back to the creator. |
| `REMOVED` | `TERMINATE` | Refund unpaid budget; transfer 100% of the remaining bond to the sponsor. |

A warning releases no payment. A later compliant check releases the next unreleased tranche, which can clear one previously held tranche. At the terminal third check, every tranche still unreleased is refunded to the sponsor. All transfers update contract accounting before making the external transfer.

## Verified checks and limitations

The repository test suite contains 18 passing tests covering authorization, deadlines, bond math, baseline and recheck behavior, warnings, both slashing paths, exact remainder handling, semantic consensus, failure recovery, and expiry settlement. GenVM lint, validation, and check commands also pass locally.

Tests mock web, LLM, and VM behavior; they are not an end-to-end Studionet campaign. Rechecks are manually triggered, the policy is fixed per campaign, and the contract stores adjudication metadata rather than a durable content snapshot. The creator bond is application-level escrow and is unrelated to GenLayer protocol validator staking.
