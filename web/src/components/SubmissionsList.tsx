"use client";

import { useReadContract } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import type { JudgeResult } from "@/lib/aiReview";
import type { RevealedAnswersBundle } from "@/lib/revealedBundle";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui";

export function SubmissionsList({
  bountyId,
  count,
  isPrivate,
  bundleRef,
  revealedBundle,
  judge,
  refreshToken,
  finalWinner,
}: {
  bountyId: bigint;
  count: number;
  isPrivate: boolean;
  bundleRef?: string;
  revealedBundle?: RevealedAnswersBundle | null;
  judge?: JudgeResult | null;
  refreshToken?: number;
  finalWinner?: number;
}) {
  const indices = Array.from({ length: count }, (_, i) => i);

  return (
    <Card>
      <CardHeader
        title="Submissions"
        subtitle={
          isPrivate
            ? bundleRef
              ? "Encrypted submissions were judged in TEE and the bundle is available."
              : "Encrypted submissions stay hidden until a post-judging bundle is available."
            : "All submissions are judged together after the deadline."
        }
        action={<Badge tone="zinc">{count}</Badge>}
      />
      <CardBody className="space-y-3">
        {count === 0 ? (
          <p className="text-sm text-zinc-500">No submissions yet.</p>
        ) : (
          indices.map((i) => (
            <SubmissionRow
              key={`${i}-${refreshToken ?? 0}`}
              bountyId={bountyId}
              index={i}
              isPrivate={isPrivate}
              bundleRef={bundleRef}
              revealedAnswer={revealedBundle?.revealedAnswers?.find((a) => a.index === i)?.answer}
              ranking={judge?.ranking?.find((r) => r.index === i)}
              recommended={judge?.winnerIndex === i}
              isWinner={finalWinner === i}
            />
          ))
        )}
      </CardBody>
    </Card>
  );
}

function SubmissionRow({
  bountyId,
  index,
  isPrivate,
  bundleRef,
  revealedAnswer,
  ranking,
  recommended,
  isWinner,
}: {
  bountyId: bigint;
  index: number;
  isPrivate: boolean;
  bundleRef?: string;
  revealedAnswer?: string;
  ranking?: { index: number; score: number; reason: string };
  recommended?: boolean;
  isWinner?: boolean;
}) {
  const functionName = isPrivate ? "getPrivateSubmission" : "getSubmission";
  const { data, isLoading } = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName,
    args: [bountyId, BigInt(index)],
    chainId: ritualChain.id,
    query: { enabled: !!contractAddress },
  });

  const typedData = data as
    | readonly [string, `0x${string}`, `0x${string}`]
    | readonly [string, `0x${string}`, string, `0x${string}`, boolean, `0x${string}`]
    | undefined;
  const submitter = typedData?.[0];
  const answer = isPrivate
    ? bundleRef
      ? revealedAnswer ?? "Bundle available. Waiting for plaintext fetch."
      : "Encrypted submission hidden until the bundle is available."
    : typedData?.[2];

  return (
    <div
      className={`rounded-xl border p-3 ${
        isWinner
          ? "border-emerald-500/40 bg-emerald-500/5"
          : recommended
            ? "border-indigo-500/40 bg-indigo-500/5"
            : "border-white/10 bg-black/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">#{index}</span>
          <span className="font-mono text-sm text-zinc-300">
            {submitter ? shortenAddress(submitter) : isLoading ? "loading…" : "-"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {ranking ? <Badge tone="zinc">score {ranking.score}</Badge> : null}
          {isWinner ? (
            <Badge tone="green">Winner</Badge>
          ) : recommended ? (
            <Badge tone="indigo">AI pick</Badge>
          ) : null}
        </div>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-200">
        {answer ?? (isLoading ? "" : "-")}
      </p>

      {ranking?.reason ? (
        <p className="mt-2 border-t border-white/5 pt-2 text-xs text-zinc-400">
          <span className="text-zinc-500">AI: </span>
          {ranking.reason}
        </p>
      ) : null}
    </div>
  );
}
