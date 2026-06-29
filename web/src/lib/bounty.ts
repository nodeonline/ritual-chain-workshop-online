import type { Address } from "viem";

/** Parsed shape of the `getBounty` tuple return value. */
export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  deadline: bigint;
  judged: boolean;
  finalized: boolean;
  submissionCount: bigint;
  revealedSubmissionCount: bigint;
  winnerIndex: bigint;
  aiReview: `0x${string}`;
  revealedAnswersRef: string;
  revealedAnswersHash: `0x${string}`;
  isPrivate: boolean;
};

/** getBounty returns a positional tuple — map it to a named object. */
export function parseBounty(
  raw: readonly [
    Address,
    string,
    string,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    bigint,
    bigint,
    `0x${string}`,
    string,
    `0x${string}`,
  ],
): Bounty {
  const [
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    revealedSubmissionCount,
    winnerIndex,
    aiReview,
    revealedAnswersRef,
    revealedAnswersHash,
  ] = raw;
  return {
    owner,
    title,
    rubric,
    reward,
    deadline,
    judged,
    finalized,
    submissionCount,
    revealedSubmissionCount,
    winnerIndex,
    aiReview,
    revealedAnswersRef,
    revealedAnswersHash,
    isPrivate: false,
  };
}

export type BountyStatus = "open" | "ready" | "judged" | "finalized";

export function getBountyStatus(b: Bounty, nowMs = Date.now()): BountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged) return "judged";
  const deadlinePassed = Number(b.deadline) <= nowMs;
  return deadlinePassed ? "ready" : "open";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  open: { label: "Open", tone: "green" },
  ready: { label: "Ready for judging", tone: "amber" },
  judged: { label: "Judged", tone: "indigo" },
  finalized: { label: "Finalized", tone: "zinc" },
};

/** Can a participant still submit an answer? */
export function canSubmit(b: Bounty, nowMs = Date.now()): boolean {
  return !b.judged && !b.finalized && Number(b.deadline) > nowMs;
}
