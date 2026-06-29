# Ritual AI Bounty Judge

Full-stack workshop project for AI-assisted bounty judging on Ritual Chain.

## Repo Layout

- `hardhat/`: Solidity contract, tests, and deployment helpers
- `web/`: Next.js frontend for creating bounties, submitting answers, judging, and finalizing winners

## What the project supports

### Required track

- Public commit-reveal bounty flow
- Answers stay hidden until `revealAnswer(...)`
- `judgeAll(...)` judges the revealed submissions in one batch
- The owner finalizes the winner manually

### Advanced track

- Private bounty flow with encrypted submissions
- Submissions stay hidden during judging
- Ritual TEE-backed batch judging evaluates all encrypted submissions together
- After judging, the owner can store a reveal bundle reference and hash on-chain
- The frontend can fetch that bundle and display plaintext answers when available

## Main Contract

[`hardhat/contracts/AIJudge.sol`](/root/ritual-chain-workshop-online/hardhat/contracts/AIJudge.sol)

Core functions:

- `createBounty(...)`
- `createPrivateBounty(...)`
- `submitCommitment(...)`
- `submitEncryptedCommitment(...)`
- `revealAnswer(...)`
- `judgeAll(...)`
- `commitRevealedAnswersBundle(...)`
- `finalizeWinner(...)`

## Ritual Defaults

The frontend defaults to:

- RPC URL: `https://rpc.ritualfoundation.org`
- Chain ID: `1979`
- LLM precompile / executor address: `0x0000000000000000000000000000000000000802`

These can be overridden in `web/.env.local`.

## Frontend Flow

The frontend lets the owner:

- create a bounty
- inspect submissions
- trigger batch judging
- view AI review output
- finalize the winner

For private bounties, the UI can also read a post-judging bundle reference from chain and attempt to fetch the published bundle contents.

## Safety Model

- Public bounties use commit-reveal.
- Private bounties use encrypted submissions.
- AI review is advisory.
- The owner still chooses the final winner.
- Large plaintext is kept out of contract storage.

## Project Structure

```text
hardhat/
  contracts/   Solidity contract
  ignition/    Deployment module
  test/        Contract tests
web/
  src/
    app/        Next.js app shell
    components/ UI and workflow components
    config/     Ritual chain config
    hooks/      React data and tx hooks
    lib/        Bounty, AI review, and Ritual helpers
```

## Reflection

Public information should include the bounty rules, deadline, reward, and final winner so the system is auditable. Hidden information should include private answers, salts, and any ciphertext that protects submissions before judging. AI should score submissions against a fixed rubric, but it should not rewrite the rules or decide eligibility. Humans should define the rubric, govern the process, and finalize the payout. In short, AI can rank content, but humans should own policy and settlement.
