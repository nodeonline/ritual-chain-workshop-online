# Privacy-Preserving AI Bounty Judge

This module implements both workshop tracks:

- **Required track**: commit-reveal bounty flow on any EVM chain
- **Advanced track**: Ritual-native private bounty with encrypted submissions and TEE-backed batch judging

## Required Track Lifecycle

1. The bounty owner creates a bounty with a reward and submission deadline.
2. During the submission phase, participants call `submitCommitment(bountyId, commitment)`.
3. After the deadline, participants reveal with `revealAnswer(bountyId, answer, salt)`.
4. The contract checks `keccak256(abi.encode(answer, salt, msg.sender, bountyId))` against the stored commitment.
5. Once at least one answer is revealed, the owner calls `judgeAll(bountyId, llmInput)`.
6. The contract stores the AI review result and marks the bounty as judged.
7. The owner calls `finalizeWinner(bountyId, winnerIndex)` to pay the winner.

## Advanced Track Lifecycle

1. The bounty owner creates a private bounty with `createPrivateBounty(...)`.
2. Each participant encrypts their answer in the browser to the selected Ritual executor public key.
3. The participant submits `submitEncryptedCommitment(bountyId, commitment, encryptedAnswer)`.
4. The encrypted payload is public on-chain, but unreadable without the executor private key inside the TEE.
5. After the deadline, the owner makes one Ritual LLM request through `judgeAll(...)`.
6. The prompt contains placeholders like `SUBMISSION_0`; the executor decrypts each `encryptedSecrets` blob inside the enclave before scoring the batch.
7. After judging, the owner may record a reveal bundle reference and hash with `commitRevealedAnswersBundle(...)`.
8. The owner finalizes the chosen winner index and pays the reward.

## Plaintext Boundary

- Required track:
  - Plaintext answers live off-chain until reveal.
  - After reveal, plaintext answers and salts become public on-chain.
- Advanced track:
  - Plaintext answers exist in the user's browser before encryption.
  - Plaintext answers exist again inside the Ritual TEE during batch judging.
  - Plaintext answers are not stored on-chain.

If the owner wants a public audit trail after judging, they can store an off-chain bundle reference such as `ipfs://...` together with a hash committed on-chain. That keeps large plaintext out of storage while still letting observers verify the exact reveal package later.

## How Judging Works

- For the required track, `judgeAll` records the AI review bytes after the reveal phase. The caller is expected to build `llmInput` from the revealed submissions and pass the judged result back to the contract.
- For the advanced track, `judgeAll` records the encoded Ritual LLM request that will be resolved by the TEE-backed executor. The batch input is built so one LLM call can compare every hidden answer together.

## Ritual Notes

- The required-track implementation is chain-agnostic.
- The advanced track adds Ritual-specific executor discovery, client-side ECIES encryption with a 12-byte nonce, and one batch LLM request through the `0x0802` precompile path.

## Commands

```bash
cd hardhat
forge test
forge build
```

Deployment to Ritual uses the Hardhat Ignition module in `ignition/modules/AIJudge.ts` and the `production` build profile with `viaIR` enabled.

## Reflection

Public information should include the bounty rules, deadlines, reward, and final winner so the system is auditable. Hidden information should include the actual answer text, because secrecy prevents copying and strategic plagiarism. The salt should also stay hidden until reveal because it binds the answer to the original submitter. AI should judge the quality of submissions against the rubric, but it should not decide the bounty rules or eligibility. A human should define the rubric, confirm the judging policy, and finalize the winner when the AI result is available. Humans remain responsible for governance, while AI is responsible for scoring content under a fixed process.
