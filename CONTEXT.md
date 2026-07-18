# SponsorGuard Domain Vocabulary

- **Sponsor**: The brand or advertising entity that creates the campaign, specifies the compliance policy, and funds the vesting escrow.
- **Creator**: The influencer or content creator who deposits the safety bond, accepts the campaign, submits content, and receives vesting payments.
- **Campaign**: The Intelligent Contract instance tracking the state machine, escrow funds, bond deposits, and compliance history.
- **Vesting Tranches**: The payment schedule split into three equal parts (with the division remainder added to Tranche 3).
- **Creator Bond**: A collateral safety deposit of exactly 20% of the total campaign budget funded by the creator upon accepting the campaign.
- **Baseline Evaluation**: The first automated check run after the creator submits their content URL. A compliant result vests Tranche 1.
- **Compliance Recheck**: Recurring validation of the content URL against the policy, triggered permissionlessly after `recheck_interval` seconds have passed.
- **Warning State**: A temporary non-compliant state holding the next tranche release, allowing the creator to remediate the content before the next check.
- **Major Violation**: Significant breach of campaign policy, resulting in immediate vesting termination and a 50% slash of the creator bond.
- **Removed/Unreachable Content**: Total unavailability of the submitted content, resulting in immediate vesting termination and a 100% slash of the creator bond.
