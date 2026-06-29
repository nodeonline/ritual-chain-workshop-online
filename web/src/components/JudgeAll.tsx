"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import type { Bounty } from "@/lib/bounty";
import {
  buildPublicJudgeAllLlmInput,
  buildPrivateJudgeAllLlmInput,
  fetchLlmExecutorService,
  type PublicJudgeSubmission,
  type PrivateJudgeSubmission,
} from "@/lib/ritualLlm";
import { useWriteTx } from "@/hooks/useWriteTx";
import { useRitualWalletStatus } from "@/hooks/useRitualWalletStatus";
import { RitualWalletPanel } from "@/components/RitualWalletPanel";
import { Card, CardHeader, CardBody, Button, TxStatus, Notice, Spinner } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function JudgeAll({
  bountyId,
  bounty,
  isOwner,
  onJudged,
}: {
  bountyId: bigint;
  bounty: Bounty;
  isOwner: boolean;
  onJudged: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const [gathering, setGathering] = useState(false);
  const [gatherError, setGatherError] = useState<string | null>(null);
  const tx = useWriteTx(() => onJudged());

  // Preflight the *connected* wallet's RitualWallet funding (not the bounty
  // contract) — judgeAll spends prepaid+locked RITUAL via the LLM precompile.
  const walletStatus = useRitualWalletStatus(address);

  const count = bounty.isPrivate
    ? Number(bounty.submissionCount)
    : Number(bounty.revealedSubmissionCount);

  // Gate per spec: owner only, has eligible submissions, not yet judged.
  if (!isOwner || bounty.judged || bounty.finalized || count === 0) {
    return null;
  }

  async function handleJudge() {
    if (!publicClient || !contractAddress || !walletStatus.ready) return;
    setGatherError(null);
    setGathering(true);
    try {
      const executor = await fetchLlmExecutorService(publicClient);
      const llmInput = bounty.isPrivate
        ? await buildPrivateRequest(publicClient, bountyId, bounty, executor.address)
        : await buildPublicRequest(publicClient, bountyId, bounty, executor.address);

      setGathering(false);

      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "judgeAll",
        args: [bountyId, llmInput],
        chainId: ritualChain.id,
      });
    } catch (e) {
      setGathering(false);
      setGatherError(
        (e as { shortMessage?: string; message?: string }).shortMessage ||
          (e as Error).message ||
          "Failed to gather submissions.",
      );
    }
  }

  const busy = gathering || tx.isBusy;
  const fundingReady = walletStatus.ready === true;

  return (
    <Card>
      <CardHeader
        title="Judge all submissions"
        subtitle={
          bounty.isPrivate
            ? "Sends one Ritual LLM request over encrypted submissions."
            : "Sends one Ritual LLM request ranking every submission."
        }
      />
      <CardBody className="space-y-3">
        <Notice tone="indigo">AI review is advisory. The bounty owner finalizes the winner.</Notice>

        <RitualWalletPanel status={walletStatus} onDeposited={walletStatus.refetch} />

        <Button onClick={handleJudge} disabled={busy || !fundingReady} className="w-full">
          {gathering ? (
            <>
              <Spinner /> Gathering {count} submissions…
            </>
          ) : tx.isBusy ? (
            "Judging…"
          ) : !fundingReady ? (
            "Fund RitualWallet to judge"
          ) : (
            `Judge all (${count})`
          )}
        </Button>
        {gatherError && <Notice tone="red">{gatherError}</Notice>}
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}

async function buildPublicRequest(
  publicClient: PublicClient,
  bountyId: bigint,
  bounty: Bounty,
  executor: `0x${string}`,
) {
  if (!contractAddress) throw new Error("contract not configured");

  const submissions: PublicJudgeSubmission[] = [];
  for (let i = 0; i < Number(bounty.revealedSubmissionCount); i++) {
    const [, submitter, , answer] = (await publicClient.readContract({
      address: contractAddress,
      abi: aiJudgeAbi,
      functionName: "getRevealedSubmission",
      args: [bountyId, BigInt(i)],
    })) as readonly [bigint, string, `0x${string}`, string, `0x${string}`];
    submissions.push({ index: i, submitter, answer });
  }

  return buildPublicJudgeAllLlmInput({
    executorAddress: executor,
    title: bounty.title,
    rubric: bounty.rubric,
    submissions,
  });
}

async function buildPrivateRequest(
  publicClient: PublicClient,
  bountyId: bigint,
  bounty: Bounty,
  executor: `0x${string}`,
) {
  if (!contractAddress) throw new Error("contract not configured");

  const submissions: PrivateJudgeSubmission[] = [];
  const encryptedSecrets: `0x${string}`[] = [];

  for (let i = 0; i < Number(bounty.submissionCount); i++) {
    const [submitter, , encryptedAnswer] = (await publicClient.readContract({
      address: contractAddress,
      abi: aiJudgeAbi,
      functionName: "getPrivateSubmission",
      args: [bountyId, BigInt(i)],
    })) as readonly [string, `0x${string}`, `0x${string}`];

    submissions.push({ index: i, submitter, secretKey: `SUBMISSION_${i}` });
    encryptedSecrets.push(encryptedAnswer);
  }

  return buildPrivateJudgeAllLlmInput({
    executorAddress: executor,
    title: bounty.title,
    rubric: bounty.rubric,
    submissions,
    encryptedSecrets,
  });
}
