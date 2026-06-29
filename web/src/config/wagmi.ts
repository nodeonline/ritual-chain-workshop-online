import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors/injected";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { ritualChainId, ritualRpcUrl, walletConnectProjectId } from "@/config/contract";

/**
 * Custom Ritual Chain definition. RPC URL and chain id come from env vars so
 * the demo can target a local devnet, a shared testnet, or mainnet.
 */
export const ritualChain = defineChain({
  id: ritualChainId,
  name: "Ritual Chain",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: { http: [ritualRpcUrl] },
  },
  blockExplorers: {
    default: { name: "RitualScan", url: "https://explorer.ritualfoundation.org" },
  },
});

export const config = createConfig({
  chains: [ritualChain],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            showQrModal: true,
          }),
        ]
      : []),
  ],
  ssr: true,
  transports: {
    [ritualChain.id]: http(ritualRpcUrl),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
