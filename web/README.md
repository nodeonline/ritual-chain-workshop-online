# AI Bounty Judge

Frontend for the Ritual Chain AI bounty workshop.

## Current Flow

The app supports two tracks:

- **Required track**: public commit-reveal bounty judging
- **Advanced track**: private encrypted submissions, Ritual TEE batch judging, and post-judging reveal

### Public bounty lifecycle

1. Create a bounty with title, rubric, deadline, and reward.
2. Submit answers before the deadline.
3. Call `revealAnswer` after the submission phase ends.
4. Call `judgeAll` to batch-judge the revealed answers.
5. Review the AI result.
6. Finalize the winner on-chain.

### Private bounty lifecycle

1. Submit encrypted answers.
2. Store only encrypted submissions or references on-chain.
3. Run `judgeAll` through Ritual TEE batch judging.
4. Publish the reveal bundle after judging.
5. The UI can fetch the bundle reference and show plaintext answers once the bundle is available.

## Deployed Config

Current contract address:

```bash
NEXT_PUBLIC_CONTRACT_ADDRESS=0xB942327d80946B9E8FC99688a03B34dBF64542ef
```

Current Ritual RPC:

```bash
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
```

Other important values:

- `NEXT_PUBLIC_RITUAL_CHAIN_ID`
- `NEXT_PUBLIC_RITUAL_EXECUTOR_ADDRESS`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

## Deploy Info

- Contract: `0xB942327d80946B9E8FC99688a03B34dBF64542ef`
- Deploy tx hash: `0x6f93411fada281e194c457057f56f7edc0747d5229c70dfaf1728dc60e58a09f`

## Run Locally

```bash
pnpm install
pnpm dev
```

## Notes

- AI review is advisory.
- The owner still finalizes the winner.
- Private answers stay hidden until the reveal bundle exists.
- The app uses the Ritual LLM precompile path for batch judging.
