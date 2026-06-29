# Architecture Note

## Goal

Support two privacy levels:

- Required track: commit-reveal hides answers until the reveal phase.
- Advanced track: Ritual-native encrypted submissions stay hidden through judging and are only exposed inside the selected TEE executor.

## On-chain state

- `createBounty` stores the bounty metadata, reward, and deadline.
- `createPrivateBounty` stores the same metadata but marks the bounty as private.
- `submitCommitment` stores only a commitment hash per submitter.
- `submitEncryptedCommitment` stores a commitment plus encrypted answer bytes for private bounties.
- `revealAnswer` stores the plaintext answer and salt only after the deadline.
- `judgeAll` stores the AI review bytes returned by the LLM path.
- `commitRevealedAnswersBundle` stores a reference and hash for the post-judging reveal bundle.
- `finalizeWinner` stores the winning revealed submission index and releases the reward.

## Plaintext boundaries

- Required track:
  - Plaintext answers live off-chain before reveal.
  - After reveal, plaintext answers and salts are public on-chain.
- Advanced track:
  - Plaintext answers exist in the user's browser before encryption.
- Plaintext answers exist again inside the Ritual TEE executor during batch judging.
- Plaintext answers are not stored on-chain and are not required to be persisted off-chain after encryption.
- After judging, the owner can record a bundle reference plus hash so the reveal package is externally inspectable without putting large plaintext directly into contract storage.

## Off-chain responsibility

- Build `llmInput` for public bounties from `getRevealedSubmission(...)`.
- Build `llmInput` for private bounties from `getPrivateSubmission(...)`.
- Encrypt each private answer client-side to the chosen executor public key using ECIES with a 12-byte nonce.
- Decide which eligible submission should win after reading the AI review.
- Keep the front end and indexing logic out of the contract.

## Security model

- The commitment binds `answer`, `salt`, `msg.sender`, and `bountyId`.
- Only the submitter who created the commitment can reveal it.
- Only revealed submissions are eligible for judging and winning.
- For private bounties, only encrypted submissions are eligible for judging and winning.
- The owner cannot finalize before judging is complete.

## Ritual-specific layer

The advanced track uses a single Ritual LLM batch request rather than one LLM call per answer.

- The frontend discovers an executor from `TEEServiceRegistry` with LLM capability.
- Each encrypted answer is passed as one `encryptedSecrets` item.
- The prompt contains placeholders such as `SUBMISSION_0`, `SUBMISSION_1`, and so on.
- Inside the TEE, Ritual decrypts each secret blob and substitutes the placeholder before the model sees the batch.
- The model receives all submissions together in one judging request, which preserves comparative ranking without exposing plaintext on-chain.
