import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, ExecutionResult, type TransactionHash } from "genlayer-js/types";
import { parseEther, formatEther, type EIP1193Provider } from "viem";
import {
  Shield,
  FileText,
  Send,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Search,
  Database,
  ExternalLink,
  Info
} from "lucide-react";
import "./App.css";

type ClientType = ReturnType<typeof createClient>;
type InjectedWalletProvider = EIP1193Provider & {
  isOkxWallet?: boolean;
  providers?: InjectedWalletProvider[];
};
type WalletWindow = Window & {
  ethereum?: InjectedWalletProvider;
  okxwallet?: InjectedWalletProvider;
};

const STUDIONET_CHAIN_ID = `0x${studionet.id.toString(16)}` as `0x${string}`;

const getInjectedWalletProvider = (): InjectedWalletProvider | null => {
  const walletWindow = window as WalletWindow;
  const injectedProviders = walletWindow.ethereum?.providers ?? [];
  return (
    walletWindow.okxwallet ??
    injectedProviders.find((provider) => provider.isOkxWallet) ??
    walletWindow.ethereum ??
    null
  );
};

const ensureStudionet = async (provider: InjectedWalletProvider) => {
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (currentChainId === STUDIONET_CHAIN_ID) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID }]
    });
  } catch (error) {
    const rpcError = error as { code?: number; message?: string };
    const needsNetwork = rpcError.code === 4902 || /unknown|unrecognized|not added/i.test(rpcError.message ?? "");
    if (!needsNetwork) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: STUDIONET_CHAIN_ID,
        chainName: studionet.name,
        nativeCurrency: studionet.nativeCurrency,
        rpcUrls: studionet.rpcUrls.default.http,
        blockExplorerUrls: studionet.blockExplorers?.default.url
          ? [studionet.blockExplorers.default.url]
          : []
      }]
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_ID }]
    });
  }
};

// Interface for Campaign
interface Campaign {
  campaign_id: number;
  sponsor: string;
  creator: string;
  budget: string;
  bond: string;
  deadline: number;
  recheck_interval: number;
  status: string;
  content_url: string;
  policy: string;
  tranches_released: number;
  checks_run: number;
  next_check_at: number;
  warning_held: boolean;
}

// Interface for Audit Check
interface CheckResult {
  sequence: number;
  timestamp: number;
  verdict: string;
  disclosure_present: boolean;
  policy_findings: string[];
  reason: string;
  recommended_action: string;
}

function App() {
  const CONTRACT_ADDRESS = (import.meta.env.VITE_SPONSOR_GUARD_ADDRESS || "").trim();
  const isContractConfigured = !!CONTRACT_ADDRESS && CONTRACT_ADDRESS.startsWith("0x") && CONTRACT_ADDRESS.length === 42;

  const [activeTab, setActiveTab] = useState<"sponsor" | "creator" | "auditor">("sponsor");
  const [client, setClient] = useState<ClientType | null>(null);
  const [walletProvider, setWalletProvider] = useState<InjectedWalletProvider | null>(null);
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [simulatedMode, setSimulatedMode] = useState(!isContractConfigured);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [searchId, setSearchId] = useState("");
  const [txState, setTxState] = useState<{
    status: string;
    step: "wallet" | "pending" | "proposing" | "committing" | "revealing" | "accepted" | "finalized" | "error" | "none";
    hash?: string;
    errorMsg?: string;
  }>({ status: "", step: "none" });

  // Form states
  const [formCreator, setFormCreator] = useState("");
  const [formPolicy, setFormPolicy] = useState("Must include sponsorship disclosure '#ad' or '#sponsored'. Must not endorse CompetitorSafe.");
  const [formBudget, setFormBudget] = useState("1.5"); // in GEN
  const [formInterval, setFormInterval] = useState("3600"); // 1 hour default
  const [formDeadlineDays, setFormDeadlineDays] = useState("30");

  const [creatorContentUrl, setCreatorContentUrl] = useState("");

  // Fixtures selector
  const [activeFixture, setActiveFixture] = useState<"compliant" | "warning" | "violation" | "removed">("compliant");

  // Load client if configured
  useEffect(() => {
    if (isContractConfigured && !simulatedMode) {
      try {
        const c = createClient({
          chain: studionet,
          account: (walletAddress && walletAddress.startsWith("0x")) ? (walletAddress as `0x${string}`) : undefined,
          provider: walletProvider ?? undefined
        });
        setClient(c);
      } catch (err) {
        console.error("Failed to initialize genlayer-js client", err);
      }
    }
  }, [isContractConfigured, simulatedMode, walletAddress, walletProvider]);

  // Connect Wallet simulation or real
  const handleConnectWallet = async () => {
    if (simulatedMode) {
      setIsWalletConnected(true);
      setWalletAddress("Offline Sandbox Account");
      return;
    }
    try {
      setTxState({ status: "Connecting to wallet...", step: "wallet" });
      const provider = getInjectedWalletProvider();
      if (!provider) {
        throw new Error("No compatible browser wallet was detected. Install or unlock OKX Wallet or another EIP-1193 wallet.");
      }

      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error("The wallet did not return a valid EVM account.");
      }

      await ensureStudionet(provider);

      const connectedClient = createClient({
        chain: studionet,
        account: address as `0x${string}`,
        provider
      });
      setWalletProvider(provider);
      setClient(connectedClient);
      setWalletAddress(address);
      setIsWalletConnected(true);
      setTxState({ status: "", step: "none" });
    } catch (err: unknown) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "The wallet connection request failed.";
      setIsWalletConnected(false);
      setWalletAddress("");
      setWalletProvider(null);
      setTxState({
        status: "Connection Rejected",
        step: "error",
        errorMsg: errorMessage
      });
    }
  };

  const sendAndFinalizeTransaction = async (
    actionName: string,
    writeFn: () => Promise<TransactionHash>
  ): Promise<boolean> => {
    if (!client) return false;
    try {
      setTxState({ status: `Awaiting signature for ${actionName}...`, step: "wallet" });
      const hash = await writeFn();
      setTxState({ status: `Transaction submitted. Hash: ${hash}`, step: "pending", hash });

      let retries = 0;
      const maxRetries = 150;

      while (retries < maxRetries) {
        const delayMs = import.meta.env.MODE === "test" ? 0 : 2000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        const tx = await client.getTransaction({ hash });
        const currentStatus = tx.statusName;

        let step: "wallet" | "pending" | "proposing" | "committing" | "revealing" | "accepted" | "finalized" | "error" | "none" = "pending";
        let statusMsg = "";

        switch (currentStatus) {
          case TransactionStatus.PENDING:
            step = "pending";
            statusMsg = "Transaction is pending in mempool...";
            break;
          case TransactionStatus.PROPOSING:
            step = "proposing";
            statusMsg = "Leader is proposing the block...";
            break;
          case TransactionStatus.COMMITTING:
            step = "committing";
            statusMsg = "Validators are committing votes...";
            break;
          case TransactionStatus.REVEALING:
            step = "revealing";
            statusMsg = "Validators are revealing votes...";
            break;
          case TransactionStatus.ACCEPTED:
            step = "accepted";
            statusMsg = "Transaction accepted by consensus...";
            break;
          case TransactionStatus.READY_TO_FINALIZE:
            step = "accepted";
            statusMsg = "Transaction ready to finalize...";
            break;
          case TransactionStatus.FINALIZED:
            step = "finalized";
            statusMsg = "Transaction finalized on-chain!";
            break;
          case TransactionStatus.UNDETERMINED:
            step = "pending";
            statusMsg = "Consensus undetermined. Retrying...";
            break;
          case TransactionStatus.CANCELED:
            step = "error";
            statusMsg = "Transaction was canceled.";
            break;
          case TransactionStatus.VALIDATORS_TIMEOUT:
            step = "error";
            statusMsg = "Validators timeout.";
            break;
          case TransactionStatus.LEADER_TIMEOUT:
            step = "error";
            statusMsg = "Leader timeout.";
            break;
          case TransactionStatus.APPEAL_COMMITTING:
            step = "committing";
            statusMsg = "Appeal committing...";
            break;
          case TransactionStatus.APPEAL_REVEALING:
            step = "revealing";
            statusMsg = "Appeal revealing...";
            break;
          default:
            step = "pending";
            statusMsg = `Transaction status: ${currentStatus}`;
        }

        setTxState({ status: statusMsg, step, hash });

        if (currentStatus === TransactionStatus.FINALIZED) {
          if (tx.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN) {
            setTxState({ status: `${actionName} Completed Successfully!`, step: "finalized", hash });
            fetchCampaignDataReal();
            return true;
          } else {
            const errStr = typeof tx.data?.error === "string" ? tx.data.error : "Contract execution reverted.";
            setTxState({
              status: "Execution Error",
              step: "error",
              errorMsg: errStr
            });
            return false;
          }
        }

        if ([
          TransactionStatus.CANCELED,
          TransactionStatus.VALIDATORS_TIMEOUT,
          TransactionStatus.LEADER_TIMEOUT
        ].includes(currentStatus as TransactionStatus)) {
          setTxState({
            status: "Transaction Failed",
            step: "error",
            errorMsg: `Transaction reached failed status: ${currentStatus}`
          });
          return false;
        }

        retries++;
      }

      if (retries >= maxRetries) {
        setTxState({
          status: "Polling Timeout",
          step: "error",
          errorMsg: "Transaction polling timed out."
        });
      }
      return false;
    } catch (err: any) {
      console.error(err);
      setTxState({ status: `${actionName} Failed`, step: "error", errorMsg: err.message });
      return false;
    }
  };

  const getFixtureUrl = (type: string) => {
    const base = window.location.origin;
    return `${base}/fixtures/${type}.html`;
  };

  // Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCreator || !formPolicy || !formBudget || !formInterval || !formDeadlineDays) return;

    const budgetWei = parseEther(formBudget);
    const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + parseInt(formDeadlineDays) * 86400);
    const intervalSecs = BigInt(parseInt(formInterval));

    if (simulatedMode) {
      setTxState({ status: "Awaiting signature...", step: "wallet" });
      setTimeout(() => {
        setTxState({ status: "Submitting transaction to mempool...", step: "pending" });
        setTimeout(() => {
          setTxState({ status: "Validators proposing block...", step: "proposing" });
          setTimeout(() => {
            setTxState({ status: "Committing validation consensus...", step: "committing" });
            setTimeout(() => {
              setTxState({ status: "Revealing transaction results...", step: "revealing" });
              setTimeout(() => {
                setTxState({ status: "Accepted by consensus...", step: "accepted" });
                setTimeout(() => {
                  const newCamp: Campaign = {
                    campaign_id: campaigns.length + 1,
                    sponsor: walletAddress || "Offline Sandbox Account",
                    creator: formCreator,
                    budget: budgetWei.toString(),
                    bond: "0",
                    deadline: Number(deadlineTimestamp),
                    recheck_interval: Number(intervalSecs),
                    status: "OPEN",
                    content_url: "",
                    policy: formPolicy,
                    tranches_released: 0,
                    checks_run: 0,
                    next_check_at: 0,
                    warning_held: false
                  };
                  setCampaigns([...campaigns, newCamp]);
                  setSelectedCampaignId(newCamp.campaign_id);
                  setTxState({ status: "Consensus Finalized successfully!", step: "finalized", hash: "sandbox-simulated-transaction" });
                }, 800);
              }, 800);
            }, 800);
          }, 800);
        }, 800);
      }, 1000);
      return;
    }

    if (!client) return;
    await sendAndFinalizeTransaction("Create Campaign", () =>
      client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "create_campaign",
        args: [formCreator, formPolicy, deadlineTimestamp, intervalSecs],
        value: budgetWei
      })
    );
  };

  // Cancel Campaign
  const handleCancelCampaign = async (id: number) => {
    if (simulatedMode) {
      setTxState({ status: "Initiating cancel signature...", step: "wallet" });
      setTimeout(() => {
        setTxState({ status: "Accepted by consensus...", step: "accepted" });
        setTimeout(() => {
          setCampaigns(campaigns.map(c => c.campaign_id === id ? { ...c, status: "CANCELED" } : c));
          setTxState({ status: "Finalized Canceled successfully!", step: "finalized" });
        }, 1000);
      }, 1000);
      return;
    }

    if (!client) return;
    await sendAndFinalizeTransaction("Cancel Campaign", () =>
      client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "cancel_campaign",
        args: [BigInt(id)],
        value: 0n
      })
    );
  };

  // Accept Campaign (Deposit Bond)
  const handleAcceptCampaign = async (campaign: Campaign) => {
    const bondWei = BigInt(campaign.budget) * 20n / 100n;
    if (simulatedMode) {
      setTxState({ status: "Confirm bond deposit of 20% in wallet...", step: "wallet" });
      setTimeout(() => {
        setTxState({ status: "Accepted by consensus...", step: "accepted" });
        setTimeout(() => {
          setCampaigns(campaigns.map(c => c.campaign_id === campaign.campaign_id ? { ...c, status: "ACCEPTED", bond: bondWei.toString() } : c));
          setTxState({ status: "Accepted & Bond Funded!", step: "finalized" });
        }, 1000);
      }, 1000);
      return;
    }

    if (!client) return;
    await sendAndFinalizeTransaction("Accept Campaign", () =>
      client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "accept_campaign",
        args: [BigInt(campaign.campaign_id)],
        value: bondWei
      })
    );
  };

  // Submit Content URL
  const handleSubmitContent = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    if (!creatorContentUrl) return;

    if (simulatedMode) {
      setTxState({ status: "Submitting content URL...", step: "wallet" });
      setTimeout(() => {
        setCampaigns(campaigns.map(c => c.campaign_id === id ? { ...c, status: "SUBMITTED", content_url: creatorContentUrl } : c));
        setTxState({ status: "URL submitted successfully!", step: "finalized" });
        setCreatorContentUrl("");
      }, 1000);
      return;
    }

    if (!client) return;
    const success = await sendAndFinalizeTransaction("Submit Content URL", () =>
      client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "submit_content",
        args: [BigInt(id), creatorContentUrl],
        value: 0n
      })
    );
    if (success) {
      setCreatorContentUrl("");
    }
  };

  // Evaluate Baseline
  const handleEvaluateBaseline = async (id: number) => {
    if (simulatedMode) {
      setTxState({ status: "Awaiting baseline trigger signature...", step: "wallet" });
      setTimeout(() => {
        setTxState({ status: "Decentralized AI Validators evaluating content...", step: "proposing" });
        setTimeout(() => {
          setTxState({ status: "Reaching consensus on verdict...", step: "committing" });
          setTimeout(() => {
            const camp = campaigns.find(c => c.campaign_id === id);
            if (!camp) return;

            let verdict = "COMPLIANT";
            let action = "RELEASE";
            let status = "ACTIVE";
            let reason = "The post is fully compliant and has #ad disclosure.";
            let findings: string[] = [];

            if (activeFixture === "warning") {
              verdict = "WARNING";
              action = "HOLD";
              status = "WARNING";
              reason = "The post does not contain any sponsor disclosure (missing #ad or #sponsored).";
              findings = ["Missing required disclosure hashtag"];
            } else if (activeFixture === "violation") {
              verdict = "MAJOR_VIOLATION";
              action = "TERMINATE";
              status = "TERMINATED";
              reason = "The post contains competitive claims ('suggest CompetitorSafe') which violates campaign policy.";
              findings = ["Competitive brand endorsement found"];
            } else if (activeFixture === "removed") {
              verdict = "REMOVED";
              action = "TERMINATE";
              status = "TERMINATED";
              reason = "The post was unreachable or deleted (simulated HTTP 404).";
              findings = ["Content is unreachable"];
            }

            const check: CheckResult = {
              sequence: 1,
              timestamp: Math.floor(Date.now() / 1000),
              verdict,
              disclosure_present: activeFixture !== "warning" && activeFixture !== "removed",
              policy_findings: findings,
              reason,
              recommended_action: action
            };

            const updatedCamp: Campaign = {
              ...camp,
              status,
              checks_run: 1,
              warning_held: verdict === "WARNING",
              tranches_released: verdict === "COMPLIANT" ? 1 : 0,
              next_check_at: verdict === "COMPLIANT" || verdict === "WARNING"
                ? Math.floor(Date.now() / 1000) + camp.recheck_interval
                : 0
            };

            setCampaigns(campaigns.map(c => c.campaign_id === id ? updatedCamp : c));
            setChecks([check]);
            setTxState({ status: `Baseline adjudication completed: ${verdict}`, step: "finalized" });
          }, 1200);
        }, 1200);
      }, 1000);
      return;
    }

    if (!client) return;
    await sendAndFinalizeTransaction("Evaluate Baseline Adjudication", () =>
      client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "evaluate_baseline",
        args: [BigInt(id)],
        value: 0n
      })
    );
  };

  // Request Recheck
  const handleRequestRecheck = async (id: number) => {
    if (simulatedMode) {
      setTxState({ status: "Awaiting recheck trigger signature...", step: "wallet" });
      setTimeout(() => {
        setTxState({ status: "AI Consensus running compliance check...", step: "proposing" });
        setTimeout(() => {
          const camp = campaigns.find(c => c.campaign_id === id);
          if (!camp) return;

          let verdict = "COMPLIANT";
          let action = "RELEASE";
          let status = camp.status;
          let reason = "The post remains fully compliant and disclosure tags are visible.";
          let findings: string[] = [];

          if (activeFixture === "warning") {
            verdict = "WARNING";
            action = "HOLD";
            status = "WARNING";
            reason = "Warning: disclosure hashtag has been deleted or removed.";
            findings = ["Missing ad disclosure tag"];
          } else if (activeFixture === "violation") {
            verdict = "MAJOR_VIOLATION";
            action = "TERMINATE";
            status = "TERMINATED";
            reason = "Major Violation: Competitor brand endorsement detected.";
            findings = ["Competitor safety app endorsement"];
          } else if (activeFixture === "removed") {
            verdict = "REMOVED";
            action = "TERMINATE";
            status = "TERMINATED";
            reason = "Content deleted or unreachable.";
            findings = ["HTTP 404 page unreachable"];
          }

          const nextSeq = camp.checks_run + 1;
          let nextTranche = camp.tranches_released;
          let warningHeld = camp.warning_held;

          if (verdict === "COMPLIANT") {
            nextTranche += 1;
            warningHeld = false;
            status = "ACTIVE";
          } else if (verdict === "WARNING") {
            status = "WARNING";
            warningHeld = true;
          } else {
            status = "TERMINATED";
          }

          if (nextSeq === 3 && (verdict === "COMPLIANT" || verdict === "WARNING")) {
            status = "COMPLETED";
          }

          const check: CheckResult = {
            sequence: nextSeq,
            timestamp: Math.floor(Date.now() / 1000),
            verdict,
            disclosure_present: activeFixture !== "warning" && activeFixture !== "removed",
            policy_findings: findings,
            reason,
            recommended_action: action
          };

          const updatedCamp: Campaign = {
            ...camp,
            status,
            checks_run: nextSeq,
            warning_held: warningHeld,
            tranches_released: nextTranche,
            next_check_at: nextSeq < 3 && (verdict === "COMPLIANT" || verdict === "WARNING")
              ? Math.floor(Date.now() / 1000) + camp.recheck_interval
              : 0
          };

          setCampaigns(campaigns.map(c => c.campaign_id === id ? updatedCamp : c));
          setChecks([...checks, check]);
          setTxState({ status: `Recheck adjudication completed: ${verdict}`, step: "finalized" });
        }, 1200);
      }, 1000);
      return;
    }

    if (!client) return;
    await sendAndFinalizeTransaction("Request Compliance Recheck", () =>
      client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "request_recheck",
        args: [BigInt(id)],
        value: 0n
      })
    );
  };

  // Settle Expired Campaign
  const handleSettleExpiredCampaign = async (id: number) => {
    if (simulatedMode) {
      setTxState({ status: "Awaiting signature...", step: "wallet" });
      setTimeout(() => {
        setTxState({ status: "Validators proposing block...", step: "proposing" });
        setTimeout(() => {
          setTxState({ status: "Accepted by consensus...", step: "accepted" });
          setTimeout(() => {
            setCampaigns(campaigns.map(c => c.campaign_id === id ? { ...c, status: "COMPLETED" } : c));
            setTxState({ status: "Campaign Settled Successfully!", step: "finalized" });
          }, 1000);
        }, 1000);
      }, 1000);
      return;
    }

    if (!client) return;
    await sendAndFinalizeTransaction("Settle Expired Campaign", () =>
      client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "settle_expired_campaign",
        args: [BigInt(id)],
        value: 0n
      })
    );
  };

  // Search/Load campaign manually
  const handleSearchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId) return;
    const id = parseInt(searchId);

    if (simulatedMode) {
      const camp = campaigns.find(c => c.campaign_id === id);
      if (camp) {
        setSelectedCampaignId(camp.campaign_id);
      } else {
        alert("Simulated Campaign not found.");
      }
      return;
    }
    // Fetch real campaign
    fetchCampaignDetailsReal(id);
  };

  // Real fetchers
  const fetchCampaignDataReal = useCallback(async () => {
    // If contract deployed, fetch contract counts and read list
    if (!client || !isContractConfigured) return;
    try {
      const count = await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_campaign_count",
        args: []
      });

      const list: Campaign[] = [];
      for (let i = 1; i <= Number(count); i++) {
        const res = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          functionName: "get_campaign",
          args: [BigInt(i)]
        });
        list.push(JSON.parse(res as string));
      }
      setCampaigns(list);
    } catch (err) {
      console.error("Real fetch error", err);
    }
  }, [client, isContractConfigured, CONTRACT_ADDRESS]);

  const fetchCampaignDetailsReal = useCallback(async (id: number) => {
    if (!client || !isContractConfigured) return;
    try {
      setTxState({ status: "Reading campaign from Studionet...", step: "pending" });
      const res = await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: "get_campaign",
        args: [BigInt(id)]
      });
      const camp: Campaign = JSON.parse(res as string);
      setSelectedCampaignId(camp.campaign_id);

      // Fetch check results
      const checkResults: CheckResult[] = [];
      for (let s = 1; s <= camp.checks_run; s++) {
        try {
          const chRes = await client.readContract({
            address: CONTRACT_ADDRESS as `0x${string}`,
            functionName: "get_check",
            args: [BigInt(id), BigInt(s)]
          });
          checkResults.push(JSON.parse(chRes as string));
        } catch {}
      }
      setChecks(checkResults);
      setTxState({ status: "", step: "none" });
    } catch {
      setTxState({ status: "Fetch Error", step: "error", errorMsg: "Campaign not found on-chain." });
    }
  }, [client, isContractConfigured, CONTRACT_ADDRESS]);

  useEffect(() => {
    if (isContractConfigured && !simulatedMode) {
      fetchCampaignDataReal();
    }
  }, [client, simulatedMode, isContractConfigured, fetchCampaignDataReal]);

  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);

  return (
    <div className="dashboard-container">
      {/* Configuration Gate & Demo Mode Banner */}
      {/* Simulation/Live Mode Prominent Labeling */}
      {simulatedMode ? (
        <div style={{
          backgroundColor: "rgba(245, 158, 11, 0.08)",
          border: "2px solid rgb(245, 158, 11)",
          color: "rgb(180, 83, 9)",
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "14px"
        }} role="alert">
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={18} /> Contract Not Deployed - OFFLINE SANDBOX SIMULATION MODE
          </h3>
          <p style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
            Running in Local Simulation Mode. Transactions do not interact with the GenLayer network. All consensus steps are simulated instantly.
            {!isContractConfigured && " (To connect a live contract, configure VITE_SPONSOR_GUARD_ADDRESS in .env)"}
          </p>
          {isContractConfigured && (
            <div style={{ marginTop: "8px" }}>
              <label style={{ fontSize: "12px", fontWeight: "bold", display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={simulatedMode}
                  onChange={(e) => setSimulatedMode(e.target.checked)}
                  style={{ marginRight: "6px" }}
                />
                Force Sandbox Simulation (Offline)
              </label>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          border: "2px solid rgb(16, 185, 129)",
          color: "rgb(4, 120, 87)",
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "14px"
        }} role="complementary">
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <Database size={18} /> CONNECTED TO LIVE STUDIONET CONTRACT
          </h3>
          <p style={{ marginTop: "4px", fontSize: "12px" }}>
            Contract Address: <code style={{ backgroundColor: "var(--color-bg)", padding: "2px 4px", fontSize: "11px" }}>{CONTRACT_ADDRESS}</code>
          </p>
          <p style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
            <strong>Requirements for Live Mode:</strong> Any submitted content URL must be a publicly accessible HTTP/HTTPS URL (e.g. a public Vercel page or Gist) so that GenLayer Studionet validators can fetch and evaluate its contents.
          </p>
          <p style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
            <strong>Wallet support:</strong> OKX Wallet and standard EIP-1193 browser wallets. SponsorGuard does not require MetaMask Snaps.
          </p>
          <div style={{ marginTop: "8px" }}>
            <label style={{ fontSize: "12px", fontWeight: "bold", display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={simulatedMode}
                onChange={(e) => setSimulatedMode(e.target.checked)}
                style={{ marginRight: "6px" }}
              />
              Force Sandbox Simulation (Offline)
            </label>
          </div>
        </div>
      )}

      {/* Offline-only demo fixtures; never presented as live contract evidence. */}
      {simulatedMode && <div className="fixtures-bar">
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Info size={18} /> Local Demo Post Fixture Control
        </h3>
        <p style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
          Offline UI simulation only. These fixtures do not call the deployed contract and are not evidence of validator consensus.
        </p>
        <div className="fixtures-grid">
          <div
            className={`fixture-card ${activeFixture === "compliant" ? "active" : ""}`}
            onClick={() => setActiveFixture("compliant")}
            role="button"
            aria-pressed={activeFixture === "compliant"}
            tabIndex={0}
          >
            <strong>1. Compliant Post</strong>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              Has #ad tag. Follows sponsor policies.
            </div>
            <a href={getFixtureUrl("compliant")} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "var(--color-brand-accent)", display: "inline-flex", alignItems: "center", gap: "2px", marginTop: "4px" }}>
              View page <ExternalLink size={10} />
            </a>
          </div>

          <div
            className={`fixture-card ${activeFixture === "warning" ? "active" : ""}`}
            onClick={() => setActiveFixture("warning")}
            role="button"
            aria-pressed={activeFixture === "warning"}
            tabIndex={0}
          >
            <strong>2. Warning Post</strong>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              Content is fine, but disclosure tag (#ad) is deleted/missing.
            </div>
            <a href={getFixtureUrl("warning")} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "var(--color-brand-accent)", display: "inline-flex", alignItems: "center", gap: "2px", marginTop: "4px" }}>
              View page <ExternalLink size={10} />
            </a>
          </div>

          <div
            className={`fixture-card ${activeFixture === "violation" ? "active" : ""}`}
            onClick={() => setActiveFixture("violation")}
            role="button"
            aria-pressed={activeFixture === "violation"}
            tabIndex={0}
          >
            <strong>3. Major Violation</strong>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              Endorses competitive product: "CompetitorSafe".
            </div>
            <a href={getFixtureUrl("violation")} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "var(--color-brand-accent)", display: "inline-flex", alignItems: "center", gap: "2px", marginTop: "4px" }}>
              View page <ExternalLink size={10} />
            </a>
          </div>

          <div
            className={`fixture-card ${activeFixture === "removed" ? "active" : ""}`}
            onClick={() => setActiveFixture("removed")}
            role="button"
            aria-pressed={activeFixture === "removed"}
            tabIndex={0}
          >
            <strong>4. Removed Post</strong>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              Simulates HTTP 404 deletion or connection timeout.
            </div>
            <a href={getFixtureUrl("removed")} target="_blank" rel="noreferrer" style={{ fontSize: "11px", color: "var(--color-brand-accent)", display: "inline-flex", alignItems: "center", gap: "2px", marginTop: "4px" }}>
              View page <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>}

      {/* Main Header */}
      <header className="header" role="banner">
        <h1>
          <Shield size={28} /> SponsorGuard MVP
        </h1>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {isWalletConnected ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span className="network-badge">STUDIONET</span>
              <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                {walletAddress.startsWith("0x") ? (
                  `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`
                ) : (
                  walletAddress
                )}
              </span>
            </div>
          ) : (
            <button className="btn" onClick={handleConnectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Navigation tabs */}
      <nav className="tabs-header" role="navigation" aria-label="Journey Switcher">
        <button
          className={`tab-btn ${activeTab === "sponsor" ? "active" : ""}`}
          onClick={() => setActiveTab("sponsor")}
          role="tab"
          aria-selected={activeTab === "sponsor"}
        >
          Sponsor Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === "creator" ? "active" : ""}`}
          onClick={() => setActiveTab("creator")}
          role="tab"
          aria-selected={activeTab === "creator"}
        >
          Creator Panel
        </button>
        <button
          className={`tab-btn ${activeTab === "auditor" ? "active" : ""}`}
          onClick={() => setActiveTab("auditor")}
          role="tab"
          aria-selected={activeTab === "auditor"}
        >
          Public Auditor Audit Trail
        </button>
      </nav>

      {/* Main layout grid */}
      <main className="main-grid">
        {/* Left Section: Active workflow view */}
        <section aria-label="Active Workspace Panel">
          {activeTab === "sponsor" && (
            <div>
              <div className="card">
                <h2>
                  <FileText size={20} /> Create New Campaign Escrow
                </h2>
                <form onSubmit={handleCreateCampaign}>
                  <div className="form-group">
                    <label htmlFor="creatorAddress">Creator Wallet Address</label>
                    <input
                      type="text"
                      id="creatorAddress"
                      required
                      value={formCreator}
                      onChange={(e) => setFormCreator(e.target.value)}
                      placeholder="0x..."
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="policyText">Campaign Policy Rules (AI Adjudicated)</label>
                    <textarea
                      id="policyText"
                      required
                      value={formPolicy}
                      onChange={(e) => setFormPolicy(e.target.value)}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div className="form-group">
                      <label htmlFor="budget">Escrow Budget (GEN)</label>
                      <input
                        type="number"
                        id="budget"
                        step="0.01"
                        required
                        value={formBudget}
                        onChange={(e) => setFormBudget(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="interval">Recheck Interval (Seconds)</label>
                      <select
                        id="interval"
                        value={formInterval}
                        onChange={(e) => setFormInterval(e.target.value)}
                      >
                        <option value="60">1 Minute (Test Mode)</option>
                        <option value="3600">1 Hour</option>
                        <option value="86400">1 Day</option>
                        <option value="604800">1 Week</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="deadline">Submission Deadline (Days)</label>
                    <input
                      type="number"
                      id="deadline"
                      required
                      value={formDeadlineDays}
                      onChange={(e) => setFormDeadlineDays(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn" style={{ width: "100%", marginTop: "8px" }} disabled={!isWalletConnected}>
                    <Send size={16} /> Deploy & Fund Campaign
                  </button>
                </form>
              </div>

              {/* Sponsor Campaigns List */}
              <div className="card">
                <h2>Escrowed Campaigns</h2>
                {campaigns.length === 0 ? (
                  <p style={{ color: "var(--color-text-secondary)" }}>No active campaigns created yet.</p>
                ) : (
                  campaigns.map(c => (
                    <div key={c.campaign_id} className="campaign-row">
                      <div>
                        <strong>Campaign #{c.campaign_id}</strong>
                        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                          Creator: {c.creator.substring(0, 8)}...
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span className={`status-badge ${c.status === "ACTIVE" ? "compliant" : c.status === "WARNING" ? "warning" : c.status === "TERMINATED" ? "violation" : "neutral"}`}>
                          {c.status}
                        </span>
                        <button className="btn btn-secondary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => setSelectedCampaignId(c.campaign_id)}>
                          Inspect
                        </button>
                        {c.status === "OPEN" && (
                          <button className="btn" style={{ backgroundColor: "var(--color-status-violation)", padding: "4px 8px", fontSize: "12px" }} onClick={() => handleCancelCampaign(c.campaign_id)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "creator" && (
            <div>
              <div className="card">
                <h2>Creator Job Invites</h2>
                {campaigns.filter(c => simulatedMode || c.creator.toLowerCase() === walletAddress.toLowerCase()).length === 0 ? (
                  <p style={{ color: "var(--color-text-secondary)" }}>No job invites found for your wallet.</p>
                ) : (
                  campaigns.filter(c => simulatedMode || c.creator.toLowerCase() === walletAddress.toLowerCase()).map(c => (
                    <div key={c.campaign_id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "16px", marginBottom: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <strong>Campaign Invite #{c.campaign_id}</strong>
                        <span className={`status-badge ${c.status === "ACTIVE" ? "compliant" : c.status === "WARNING" ? "warning" : c.status === "TERMINATED" ? "violation" : "neutral"}`}>
                          {c.status}
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", marginBottom: "8px" }}><strong>Escrow Policy:</strong> {c.policy}</p>

                      <div className="campaign-details-grid" style={{ marginBottom: "12px" }}>
                        <div className="campaign-detail-item">
                          <span className="campaign-detail-label">Budget</span>
                          <span className="campaign-detail-value">{formatEther(BigInt(c.budget))} GEN</span>
                        </div>
                        <div className="campaign-detail-item">
                          <span className="campaign-detail-label">Required Safety Bond (20%)</span>
                          <span className="campaign-detail-value">{formatEther(BigInt(c.budget) * 20n / 100n)} GEN</span>
                        </div>
                      </div>

                      {c.status === "OPEN" && (
                        <button className="btn" onClick={() => handleAcceptCampaign(c)}>
                          Accept Job & Deposit Bond ({formatEther(BigInt(c.budget) * 20n / 100n)} GEN)
                        </button>
                      )}

                      {c.status === "ACCEPTED" && (
                        <form onSubmit={(e) => handleSubmitContent(e, c.campaign_id)} style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label htmlFor={`url-${c.campaign_id}`} className="sr-only">Content URL</label>
                            <input
                              type="url"
                              id={`url-${c.campaign_id}`}
                              required
                              value={creatorContentUrl}
                              onChange={(e) => setCreatorContentUrl(e.target.value)}
                              placeholder="https://public.example/post-id"
                            />
                          </div>
                          <button type="submit" className="btn">
                            Submit URL
                          </button>
                        </form>
                      )}

                      {c.status === "SUBMITTED" && (
                        <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>URL Submitted. Awaiting Baseline Check.</span>
                          <button className="btn" onClick={() => handleEvaluateBaseline(c.campaign_id)}>
                            Trigger Baseline Adjudication
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "auditor" && (
            <div>
              <div className="card">
                <h2>
                  <Search size={20} /> Query Adjudicated Campaigns
                </h2>
                <form onSubmit={handleSearchCampaign} style={{ display: "flex", gap: "8px" }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label htmlFor="searchIdInput" className="sr-only">Campaign ID</label>
                    <input
                      type="number"
                      id="searchIdInput"
                      required
                      value={searchId}
                      onChange={(e) => setSearchId(e.target.value)}
                      placeholder="Enter Campaign ID (e.g. 1)"
                    />
                  </div>
                  <button type="submit" className="btn">
                    Find Campaign
                  </button>
                </form>
              </div>

              {selectedCampaign && (
                <div className="card">
                  <h2>Auditor Compliance Actions</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>Permit rechecks gated by block timestamps</strong>
                        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                          Current timestamp: {new Date().toLocaleTimeString()}
                        </div>
                      </div>
                      {(selectedCampaign.status === "ACTIVE" || selectedCampaign.status === "WARNING") && (
                        <button className="btn" onClick={() => handleRequestRecheck(selectedCampaign.campaign_id)}>
                          <RefreshCw size={14} /> Request Compliance Recheck
                        </button>
                      )}
                    </div>

                    {["SUBMITTED", "ACTIVE", "WARNING"].includes(selectedCampaign.status) && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
                        <div>
                          <strong>Settle Campaign after deadline expiration</strong>
                          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                            Deadline: {new Date(selectedCampaign.deadline * 1000).toLocaleString()}
                          </div>
                        </div>
                        <button
                          className="btn"
                          onClick={() => handleSettleExpiredCampaign(selectedCampaign.campaign_id)}
                          disabled={Date.now() / 1000 < selectedCampaign.deadline}
                          style={Date.now() / 1000 < selectedCampaign.deadline ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                          title={Date.now() / 1000 < selectedCampaign.deadline ? "Deadline has not been reached yet" : "Trigger settlement"}
                        >
                          Settle Expired Campaign
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Section: Inspected Campaign view & Transaction logs */}
        <aside aria-label="Campaign Details and Transaction Logs">
          {/* Active Inspected Campaign */}
          {selectedCampaign ? (
            <div className="card">
              <h2>Campaign Details</h2>
              <div className="campaign-details-grid">
                <div className="campaign-detail-item">
                  <span className="campaign-detail-label">ID</span>
                  <span className="campaign-detail-value">#{selectedCampaign.campaign_id}</span>
                </div>
                <div className="campaign-detail-item">
                  <span className="campaign-detail-label">Status</span>
                  <span className={`status-badge ${selectedCampaign.status === "ACTIVE" ? "compliant" : selectedCampaign.status === "WARNING" ? "warning" : selectedCampaign.status === "TERMINATED" ? "violation" : "neutral"}`}>
                    {selectedCampaign.status}
                  </span>
                </div>
                <div className="campaign-detail-item" style={{ gridColumn: "1 / -1" }}>
                  <span className="campaign-detail-label">Sponsor</span>
                  <span className="campaign-detail-value">{selectedCampaign.sponsor}</span>
                </div>
                <div className="campaign-detail-item" style={{ gridColumn: "1 / -1" }}>
                  <span className="campaign-detail-label">Creator</span>
                  <span className="campaign-detail-value">{selectedCampaign.creator}</span>
                </div>
                <div className="campaign-detail-item">
                  <span className="campaign-detail-label">Budget</span>
                  <span className="campaign-detail-value">{formatEther(BigInt(selectedCampaign.budget))} GEN</span>
                </div>
                <div className="campaign-detail-item">
                  <span className="campaign-detail-label">Creator Bond</span>
                  <span className="campaign-detail-value">{formatEther(BigInt(selectedCampaign.bond))} GEN</span>
                </div>
                <div className="campaign-detail-item">
                  <span className="campaign-detail-label">Vesting released</span>
                  <span className="campaign-detail-value">
                    {selectedCampaign.tranches_released === 0 ? "0/3" : selectedCampaign.tranches_released === 1 ? "1/3 (Tranche 1)" : selectedCampaign.tranches_released === 2 ? "2/3 (Tranches 1 & 2)" : "3/3 (Fully Vested)"}
                  </span>
                </div>
                <div className="campaign-detail-item">
                  <span className="campaign-detail-label">Checks completed</span>
                  <span className="campaign-detail-value">{selectedCampaign.checks_run} / 3</span>
                </div>
                {selectedCampaign.content_url && (
                  <div className="campaign-detail-item" style={{ gridColumn: "1 / -1" }}>
                    <span className="campaign-detail-label">Content URL</span>
                    <a href={selectedCampaign.content_url} target="_blank" rel="noreferrer" className="campaign-detail-value" style={{ color: "var(--color-brand-accent)", textDecoration: "underline" }}>
                      {selectedCampaign.content_url}
                    </a>
                  </div>
                )}
              </div>

              {/* Compliance Adjudication Audit Log */}
              {checks.length > 0 && (
                <div style={{ marginTop: "24px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: "bold", borderBottom: "1px solid var(--color-border)", paddingBottom: "4px", marginBottom: "12px" }}>
                    AI Adjudication History
                  </h3>
                  <div className="audit-list">
                    {checks.map(chk => (
                      <div key={chk.sequence} className="audit-item">
                        <div className="audit-item-header">
                          <strong>Check #{chk.sequence}</strong>
                          <span className={`status-badge ${chk.verdict === "COMPLIANT" ? "compliant" : chk.verdict === "WARNING" ? "warning" : "violation"}`}>
                            {chk.verdict}
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                          Timestamp: {new Date(chk.timestamp * 1000).toLocaleString()}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "12px" }}>
                          <strong>Reason:</strong> {chk.reason}
                        </div>
                        {chk.policy_findings.length > 0 && (
                          <ul className="audit-findings">
                            {chk.policy_findings.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        )}
                        <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: "bold" }}>
                          Action: <span style={{ color: chk.recommended_action === "RELEASE" ? "var(--color-status-compliant)" : chk.recommended_action === "HOLD" ? "var(--color-status-warning)" : "var(--color-status-violation)" }}>{chk.recommended_action}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "200px" }}>
              <Info size={36} style={{ color: "var(--color-text-muted)", marginBottom: "12px" }} />
              <p style={{ color: "var(--color-text-secondary)", textAlign: "center" }}>
                Select or inspect a campaign to view escrow details, vesting tranches, and compliance audit trail history.
              </p>
            </div>
          )}

          {/* Transaction visualizer state logs */}
          {txState.step !== "none" && (
            <div className="tx-visualizer" aria-live="polite">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Consensus Pipeline Status</strong>
                {txState.step === "finalized" && <CheckCircle size={16} style={{ color: "var(--color-status-compliant)" }} />}
                {txState.step === "error" && <XCircle size={16} style={{ color: "var(--color-status-violation)" }} />}
                {txState.step !== "finalized" && txState.step !== "error" && <Clock size={16} className="spin" style={{ color: "var(--color-brand-accent)" }} />}
              </div>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{txState.status}</p>

              {txState.hash && (
                <div style={{ fontSize: "10px", wordBreak: "break-all", color: "var(--color-text-muted)" }}>
                  Tx Hash: {txState.hash}
                </div>
              )}

              {txState.errorMsg && (
                <div style={{ fontSize: "11px", color: "var(--color-status-violation)", border: "1px solid var(--color-status-violation)", padding: "6px", borderRadius: "4px", backgroundColor: "var(--color-status-violation-bg)", marginTop: "4px" }}>
                  <strong>Error Details:</strong> {txState.errorMsg}
                </div>
              )}

              {/* Steps timeline for transaction */}
              {txState.step !== "error" && (
                <div className="tx-steps">
                  <div className="tx-line"></div>
                  <div className={`tx-step ${txState.step === "wallet" ? "active" : ["pending", "proposing", "committing", "revealing", "accepted", "finalized"].includes(txState.step) ? "completed" : ""}`}>
                    <span className="tx-step-dot"></span>
                    <span>Sign</span>
                  </div>
                  <div className={`tx-step ${txState.step === "pending" ? "active" : ["proposing", "committing", "revealing", "accepted", "finalized"].includes(txState.step) ? "completed" : ""}`}>
                    <span className="tx-step-dot"></span>
                    <span>Pending</span>
                  </div>
                  <div className={`tx-step ${txState.step === "proposing" ? "active" : ["committing", "revealing", "accepted", "finalized"].includes(txState.step) ? "completed" : ""}`}>
                    <span className="tx-step-dot"></span>
                    <span>Proposing</span>
                  </div>
                  <div className={`tx-step ${txState.step === "committing" ? "active" : ["revealing", "accepted", "finalized"].includes(txState.step) ? "completed" : ""}`}>
                    <span className="tx-step-dot"></span>
                    <span>Consensus</span>
                  </div>
                  <div className={`tx-step ${txState.step === "revealing" ? "active" : ["accepted", "finalized"].includes(txState.step) ? "completed" : ""}`}>
                    <span className="tx-step-dot"></span>
                    <span>Reveal</span>
                  </div>
                  <div className={`tx-step ${txState.step === "accepted" ? "active" : ["finalized"].includes(txState.step) ? "completed" : ""}`}>
                    <span className="tx-step-dot"></span>
                    <span>Accepted</span>
                  </div>
                  <div className={`tx-step ${txState.step === "finalized" ? "active completed" : ""}`}>
                    <span className="tx-step-dot"></span>
                    <span>Finalized</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
