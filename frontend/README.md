# SponsorGuard Frontend

This directory contains the reviewer-facing React dashboard for SponsorGuard, a GenLayer Studionet sponsorship-compliance escrow. It supports sponsor, creator, and public-auditor flows against the deployed Intelligent Contract and keeps its offline sandbox visibly separate from live network activity.

## Verified live configuration

| Item | Value |
| --- | --- |
| App | [sponsorguard-buildgenlayer.vercel.app](https://sponsorguard-buildgenlayer.vercel.app) |
| Network | GenLayer Studionet (chain ID `61999`) |
| Contract | [`0x2012c18961Ba71Defb3de61eabCb87866938CC95`](https://explorer-studio.genlayer.com/address/0x2012c18961Ba71Defb3de61eabCb87866938CC95) |
| Deployment transaction | [`0xaa536e421507497e483cd50e6b316bece714d8e52a04241dac34367427d53c54`](https://explorer-studio.genlayer.com/tx/0xaa536e421507497e483cd50e6b316bece714d8e52a04241dac34367427d53c54) |

## Stack

- React 19 and TypeScript 6
- Vite 8
- `genlayer-js` 1.1.x with the exported `studionet` chain
- `viem` for exact GEN/wei parsing and formatting
- Vitest and Testing Library
- Oxlint

## Environment configuration

Copy the environment template and set a real deployed contract address:

```powershell
Copy-Item .env.example .env
```

```dotenv
VITE_SPONSOR_GUARD_ADDRESS=0x2012c18961Ba71Defb3de61eabCb87866938CC95
```

The committed `.env.example` intentionally leaves the value empty. The application never substitutes a placeholder address. With no configured address it starts in an offline sandbox; with an address it starts in live mode and still lets the user explicitly opt into the sandbox.

## User flows and contract calls

### Sponsor

- Connect a Studionet-compatible wallet.
- Create and fund a campaign through `create_campaign`.
- Cancel an untouched `OPEN` campaign through `cancel_campaign`.
- Read all campaigns through `get_campaign_count` and `get_campaign`.

### Creator

- Accept an assigned campaign and deposit the exact 20% bond through `accept_campaign`.
- Submit a publicly accessible HTTP/HTTPS content URL through `submit_content`.
- Trigger the initial evaluation through `evaluate_baseline`.

### Public auditor

- Read a campaign and its stored checks through `get_campaign` and `get_check`.
- Trigger a timestamp-gated follow-up through `request_recheck`.
- Settle an eligible expired campaign through `settle_expired_campaign`.

The live path calls these methods directly through `genlayer-js`. Static files under `public/fixtures` are available only as offline UI demonstrations; their selector is hidden in live mode, and they are not evidence of contract execution or validator consensus.

## Transaction lifecycle and recovery

For every live write, the dashboard requests a wallet signature, stores the returned transaction hash, and polls `client.getTransaction({ hash })` through the GenLayer lifecycle:

```text
PENDING -> PROPOSING -> COMMITTING -> REVEALING
        -> ACCEPTED / READY_TO_FINALIZE -> FINALIZED
```

Appeal commit/reveal states are also rendered if returned by the network. `UNDETERMINED` remains pending and is polled again. A transaction is shown as successful only when both conditions hold:

1. `statusName === FINALIZED`
2. `txExecutionResultName === FINISHED_WITH_RETURN`

`FINISHED_WITH_ERROR` is shown as a contract execution failure and does not trigger a state refresh. `CANCELED`, `VALIDATORS_TIMEOUT`, and `LEADER_TIMEOUT` are terminal failures. RPC or wallet exceptions are surfaced with the action name. Polling stops after 150 attempts at a 2-second production interval and displays `Polling Timeout`.

After an execution failure, correct the contract input or state before retrying. After an RPC/polling timeout, use the displayed hash to inspect Explorer and refresh the campaign before resubmitting, especially for value-bearing calls. The frontend intentionally does not treat submission or consensus acceptance as final success.

## Commands

```powershell
npm install
npm run dev
npm test -- --run
npm run lint
npm run build
```

Current verified local results:

- 11/11 Vitest tests pass.
- Oxlint passes.
- The TypeScript/Vite production build succeeds.
- Vite reports a bundle-size warning because the main JavaScript chunk is above 500 kB; this is documented, not hidden.

## Deployment boundary

The repository does not contain a Vercel deployment script. Vercel builds this directory through the linked project configuration. Changing `VITE_SPONSOR_GUARD_ADDRESS` requires a new verified deployment; never insert a guessed or placeholder contract address.

See the [root README](../README.md) for contract semantics, verified evidence, setup, and trust boundaries.
