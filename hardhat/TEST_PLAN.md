# Test Plan

## Commit cases

- Submit a commitment before the deadline.
- Reject a second commitment from the same address.
- Reject commitments after the deadline.
- Reject public commitments on private bounties.
- Accept encrypted commitments on private bounties.

## Reveal cases

- Reveal succeeds with the exact answer and salt used to generate the commitment.
- Reveal fails before the deadline.
- Reveal fails with the wrong salt.
- Reveal fails with the wrong answer.
- Reveal fails if the sender never committed.
- Reveal fails if the answer exceeds the maximum length.
- Reveal fails on private bounties.

## Judging cases

- Reject `judgeAll` when no revealed answers exist.
- Accept `judgeAll` only after the deadline.
- Store the returned AI review bytes.
- Reject `judgeAll` if called twice.
- For private bounties, accept `judgeAll` when encrypted submissions exist even though no plaintext reveal occurred.
- Reject bundle commits before judging.
- Accept bundle commits after judging with a non-empty ref and nonzero hash.
- Reject bundle commits with an empty ref or zero hash.

## Finalization cases

- Reject finalization before judging.
- Reject a winner index outside the revealed submission list.
- Pay the selected revealed winner.
- Prevent double finalization.
- For private bounties, pay the selected encrypted-submission winner.
