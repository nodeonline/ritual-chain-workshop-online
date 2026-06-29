"use client";

import { useCallback } from "react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { useBounty } from "@/hooks/useBounty";
import { isAddressEqual } from "@/lib/format";
import { decodeAiReview } from "@/lib/aiReview";
import { BountyDetail } from "@/components/BountyDetail";
import { SubmitAnswer } from "@/components/SubmitAnswer";
import { RevealAnswer } from "@/components/RevealAnswer";
import { JudgeAll } from "@/components/JudgeAll";
import { FinalizeWinner } from "@/components/FinalizeWinner";
import { AIReviewDisplay } from "@/components/AIReviewDisplay";
import { SubmissionsList } from "@/components/SubmissionsList";
import { fetchRevealedAnswersBundle, type RevealedAnswersBundle } from "@/lib/revealedBundle";
import { Card, CardBody, Notice, Spinner } from "@/components/ui";

export function BountyView({ bountyId }: { bountyId: bigint }) {
  const { address } = useAccount();
  const { bounty, isLoading, isError, refetch } = useBounty(bountyId);
  const bundleQuery = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "getRevealedAnswersBundle",
    args: [bountyId],
    chainId: ritualChain.id,
    query: { enabled: !!contractAddress && !!bounty?.judged },
  });
  const bundle = bundleQuery.data as
    | readonly [string, `0x${string}`]
    | undefined;

  const [submissionRefresh, setSubmissionRefresh] = useState(0);

  const [revealedBundle, setRevealedBundle] = useState<RevealedAnswersBundle | null>(null);
  const [bundleLoadState, setBundleLoadState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [bundleLoadError, setBundleLoadError] = useState<string | null>(null);

  const reloadSubmissions = useCallback(() => {
    setSubmissionRefresh((value) => value + 1);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    let cancelled = false;

    async function loadBundle() {
      if (!bounty?.judged) {
        setRevealedBundle(null);
        setBundleLoadState("idle");
        setBundleLoadError(null);
        return;
      }

      const ref = bundle?.[0]?.trim();
      if (!ref) {
        setRevealedBundle(null);
        setBundleLoadState("idle");
        setBundleLoadError(null);
        return;
      }

      setBundleLoadState("loading");
      setBundleLoadError(null);

      try {
        const data = await fetchRevealedAnswersBundle(ref);
        if (cancelled) return;
        setRevealedBundle(data);
        setBundleLoadState(data ? "ready" : "failed");
        if (!data) setBundleLoadError("Bundle could not be fetched or parsed.");
      } catch {
        if (cancelled) return;
        setRevealedBundle(null);
        setBundleLoadState("failed");
        setBundleLoadError("Bundle fetch failed.");
      }
    }

    void loadBundle();
    return () => {
      cancelled = true;
    };
  }, [bounty?.judged, bundle]);

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner /> Loading bounty #{bountyId.toString()}…
          </div>
        </CardBody>
      </Card>
    );
  }

  if (isError || !bounty) {
    return (
      <Notice tone="red">
        Couldn&apos;t load bounty #{bountyId.toString()}. Check the id and that the
        contract address / RPC are configured correctly.
      </Notice>
    );
  }

  // An owner of address(0) means the bounty doesn't exist yet.
  if (/^0x0+$/.test(bounty.owner)) {
    return (
      <Notice tone="amber">
        Bounty #{bountyId.toString()} doesn&apos;t exist.
      </Notice>
    );
  }

  const isOwner = isAddressEqual(address, bounty.owner);
  const judge = decodeAiReview(bounty.aiReview)?.parsed ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Left column: details + owner/participant actions */}
      <div className="space-y-4">
        <BountyDetail bountyId={bountyId} bounty={bounty} isOwner={isOwner} />
        <SubmitAnswer
          bountyId={bountyId}
          bounty={bounty}
          onSubmitted={reloadSubmissions}
        />
        <RevealAnswer
          bountyId={bountyId}
          bounty={bounty}
          onRevealed={reloadSubmissions}
        />
        <JudgeAll
          bountyId={bountyId}
          bounty={bounty}
          isOwner={isOwner}
          onJudged={reloadSubmissions}
        />
        <FinalizeWinner
          bountyId={bountyId}
          bounty={bounty}
          isOwner={isOwner}
          onFinalized={reloadSubmissions}
        />
      </div>

      {/* Right column: AI review + submissions */}
      <div className="space-y-4">
        {bounty.judged && <AIReviewDisplay aiReview={bounty.aiReview} />}
        {bundle?.[0] ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Revealed bundle
                </div>
                <div className="mt-1 break-all text-sm text-zinc-200">
                  {bundle[0]}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Bundle hash
                </div>
                <div className="mt-1 font-mono text-xs text-zinc-300">
                  {bundle[1]}
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              {bundleLoadState === "loading"
                ? "Loading published answers bundle…"
                : bundleLoadState === "ready"
                  ? "Bundle fetched successfully."
                  : bundleLoadState === "failed"
                    ? bundleLoadError ?? "Bundle unavailable."
                    : "Bundle reference stored on-chain."}
            </div>
          </div>
        ) : null}
        <SubmissionsList
          bountyId={bountyId}
          count={Number(bounty.submissionCount)}
          isPrivate={bounty.isPrivate}
          bundleRef={bundle?.[0]}
          revealedBundle={revealedBundle}
          judge={judge}
          refreshToken={submissionRefresh}
          finalWinner={
            bounty.finalized ? Number(bounty.winnerIndex) : undefined
          }
        />
      </div>
    </div>
  );
}
