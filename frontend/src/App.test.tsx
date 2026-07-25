import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import "@testing-library/jest-dom";
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";
import { parseEther, formatEther } from "viem";

const mockGetTransaction = vi.fn();
const mockReadContract = vi.fn();
const mockWriteContract = vi.fn().mockResolvedValue(`0x${"ab".repeat(32)}`);
const mockWalletRequest = vi.fn();
const TEST_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111";
const mockGetTransactionReceipt = vi.fn().mockImplementation(() => {
  throw new Error("Should not use getTransactionReceipt - use getTransaction instead");
});

vi.mock("genlayer-js", () => {
  return {
    createClient: vi.fn().mockReturnValue({
      connect: vi.fn(),
      getAddresses: vi.fn().mockResolvedValue(["0x1111111111111111111111111111111111111111"]),
      readContract: (...args: any[]) => mockReadContract(...args),
      writeContract: (...args: any[]) => mockWriteContract(...args),
      getTransaction: (...args: any[]) => mockGetTransaction(...args),
      getTransactionReceipt: (...args: any[]) => mockGetTransactionReceipt(...args)
    })
  };
});

describe("SponsorGuard Frontend Dashboard Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SPONSOR_GUARD_ADDRESS", "");
    Object.defineProperty(window, "okxwallet", { configurable: true, value: undefined });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should show configuration gate warning if contract address env is missing", () => {
    render(<App />);
    expect(screen.getByText(/Contract Not Deployed/i)).toBeInTheDocument();
    expect(screen.getByText(/Local Simulation Mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Local Demo Post Fixture Control/i)).toBeInTheDocument();
  });

  it("should enforce wallet connection requirements before enabling creation triggers", () => {
    render(<App />);
    const deployBtn = screen.getByRole("button", { name: /Deploy & Fund Campaign/i });
    expect(deployBtn).toBeDisabled();

    const connectBtn = screen.getByRole("button", { name: /Connect Wallet/i });
    fireEvent.click(connectBtn);

    expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
    expect(deployBtn).not.toBeDisabled();
  });

  it("should transition between sponsor, creator, and auditor tabs accessibly", () => {
    render(<App />);

    // Default sponsor tab active
    expect(screen.getByLabelText(/Creator Wallet Address/i)).toBeInTheDocument();
    expect(screen.queryByText(/Accept Job & Deposit Bond/i)).not.toBeInTheDocument();

    // Click Creator Panel
    const creatorTabBtn = screen.getByRole("tab", { name: /Creator Panel/i });
    fireEvent.click(creatorTabBtn);

    expect(screen.getByText(/Creator Job Invites/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Creator Wallet Address/i)).not.toBeInTheDocument();

    // Click Auditor tab
    const auditorTabBtn = screen.getByRole("tab", { name: /Public Auditor/i });
    fireEvent.click(auditorTabBtn);
    expect(screen.getByLabelText(/Campaign ID/i)).toBeInTheDocument();
  });

  it("should map simulation transactions through mempool, consensus and finalization stages", async () => {
    render(<App />);

    // Connect wallet
    fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));

    // Fill out create campaign form
    fireEvent.change(screen.getByLabelText(/Creator Wallet Address/i), { target: { value: "0x1234567890123456789012345678901234567890" } });
    fireEvent.change(screen.getByLabelText(/Campaign Policy/i), { target: { value: "Disclosure ad hashtag required" } });

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: /Deploy & Fund/i }));

    // Verify pipeline steps
    expect(screen.getByText(/Awaiting signature/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Submitting transaction/i)).toBeInTheDocument();
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(screen.getByText(/Validators proposing/i)).toBeInTheDocument();
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(screen.getByText(/Committing validation consensus/i)).toBeInTheDocument();
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(screen.getByText(/Consensus Finalized successfully/i)).toBeInTheDocument();
    }, { timeout: 6000 });
  }, 10000);

  it("should have visible focus outlines for accessibility", () => {
    render(<App />);
    const connectBtn = screen.getByRole("button", { name: /Connect Wallet/i });
    connectBtn.focus();
    expect(connectBtn).toHaveFocus();
  });

  it("should handle responsive selector tabs smoothly", () => {
    render(<App />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(3);
  });

  describe("Precision Math Verification", () => {
    it("should parse and format Ether with absolute precision", () => {
      expect(parseEther("1.1")).toBe(1100000000000000000n);
      expect(parseEther("1.234567890123456789")).toBe(1234567890123456789n);

      const budget = parseEther("1.234567890123456789");
      const bond = budget * 20n / 100n;
      expect(bond).toBe(246913578024691357n); // exactly 20%, no rounding error

      expect(formatEther(budget)).toBe("1.234567890123456789");
      expect(formatEther(bond)).toBe("0.246913578024691357");
    });
  });

  describe("Live Mode Polling & API Schema Verification", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_SPONSOR_GUARD_ADDRESS", "0xdc18aa3db8bc91a6e390a35e7d0811240F3ab001");
      mockWalletRequest.mockImplementation(({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") return Promise.resolve([TEST_WALLET_ADDRESS]);
        if (method === "eth_chainId") return Promise.resolve("0xf22f");
        return Promise.resolve(null);
      });
      Object.defineProperty(window, "okxwallet", {
        configurable: true,
        value: { request: (...args: unknown[]) => mockWalletRequest(...args) }
      });
      mockReadContract.mockResolvedValue(JSON.stringify({
        campaign_id: 1,
        sponsor: "0x1111111111111111111111111111111111111111",
        creator: "0x2222222222222222222222222222222222222222",
        budget: "1234567890123456789",
        bond: "246913578024691357",
        deadline: 9999999999,
        recheck_interval: 3600,
        status: "OPEN",
        content_url: "",
        policy: "Disclosure ad hashtag required",
        tranches_released: 0,
        checks_run: 0,
        next_check_at: 0,
        warning_held: false
      }));
    });

    it("should connect OKX through standard EIP-1193 without requesting MetaMask Snaps", async () => {
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
      });

      const requestedMethods = mockWalletRequest.mock.calls.map(([request]) => request.method);
      expect(requestedMethods).toContain("eth_requestAccounts");
      expect(requestedMethods).toContain("eth_chainId");
      expect(requestedMethods).not.toContain("wallet_getSnaps");
      expect(screen.getByText(/0x1111\.\.\.1111/i)).toBeInTheDocument();
    });

    it("should add and switch to Studionet when OKX does not know the network", async () => {
      let switchAttempts = 0;
      mockWalletRequest.mockImplementation(({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") return Promise.resolve([TEST_WALLET_ADDRESS]);
        if (method === "eth_chainId") return Promise.resolve("0x1");
        if (method === "wallet_switchEthereumChain" && switchAttempts++ === 0) {
          return Promise.reject({ code: 4902, message: "Unknown chain" });
        }
        return Promise.resolve(null);
      });

      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
      });

      const requestedMethods = mockWalletRequest.mock.calls.map(([request]) => request.method);
      expect(requestedMethods).toContain("wallet_addEthereumChain");
      expect(requestedMethods.filter((method) => method === "wallet_switchEthereumChain")).toHaveLength(2);
    });

    it("should remain rendered and disconnected when the wallet rejects connection", async () => {
      mockWalletRequest.mockRejectedValue(new Error("User rejected the request"));
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.getByText(/Connection Rejected/i)).toBeInTheDocument();
        expect(screen.getByText(/User rejected the request/i)).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /Connect Wallet/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /SponsorGuard MVP/i })).toBeInTheDocument();
    });

    it("should successfully poll and finalize live transaction and refresh state", async () => {
      mockGetTransaction
        .mockResolvedValueOnce({
          statusName: TransactionStatus.PENDING
        })
        .mockResolvedValueOnce({
          statusName: TransactionStatus.ACCEPTED
        })
        .mockResolvedValueOnce({
          statusName: TransactionStatus.FINALIZED,
          txExecutionResultName: ExecutionResult.FINISHED_WITH_RETURN
        });

      render(<App />);
      expect(screen.queryByText(/Local Demo Post Fixture Control/i)).not.toBeInTheDocument();

      // Connect wallet and await async completion
      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Creator Wallet Address/i), { target: { value: "0x2222222222222222222222222222222222222222" } });
      fireEvent.change(screen.getByLabelText(/Campaign Policy/i), { target: { value: "Disclosure ad hashtag required" } });
      fireEvent.change(screen.getByLabelText(/Budget/i), { target: { value: "1.234567890123456789" } });

      mockReadContract.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Deploy & Fund/i }));

      await waitFor(() => {
        expect(screen.getByText(/mempool/i)).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByText(/accepted by consensus/i)).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByText(/Completed Successfully/i)).toBeInTheDocument();
      });

      expect(mockReadContract).toHaveBeenCalled();
      expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
    });

    it("should recognize a successful Studionet raw consensus receipt when the SDK omits txExecutionResultName", async () => {
      mockGetTransaction.mockResolvedValue({
        statusName: TransactionStatus.FINALIZED,
        consensus_data: {
          leader_receipt: [{
            execution_result: "SUCCESS",
            genvm_result: { stderr: "", raw_error: null, error_description: null }
          }]
        }
      });

      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Creator Wallet Address/i), { target: { value: "0x2222222222222222222222222222222222222222" } });
      fireEvent.change(screen.getByLabelText(/Campaign Policy/i), { target: { value: "Disclosure ad hashtag required" } });
      fireEvent.change(screen.getByLabelText(/Budget/i), { target: { value: "0.03" } });

      mockReadContract.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Deploy & Fund/i }));

      await waitFor(() => {
        expect(screen.getByText(/Completed Successfully/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Execution Error/i)).not.toBeInTheDocument();
      expect(mockReadContract).toHaveBeenCalled();
    });

    it("should show execution error and not refresh state when live transaction execution fails", async () => {
      mockGetTransaction.mockResolvedValue({
        statusName: TransactionStatus.FINALIZED,
        txExecutionResultName: ExecutionResult.FINISHED_WITH_ERROR,
        data: { error: "Execution Reverted due to custom checks" }
      });

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Creator Wallet Address/i), { target: { value: "0x2222222222222222222222222222222222222222" } });
      fireEvent.change(screen.getByLabelText(/Campaign Policy/i), { target: { value: "Disclosure ad hashtag required" } });
      fireEvent.change(screen.getByLabelText(/Budget/i), { target: { value: "1" } });

      mockReadContract.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Deploy & Fund/i }));

      await waitFor(() => {
        expect(screen.getByText(/Execution Error/i)).toBeInTheDocument();
        expect(screen.getByText(/Execution Reverted due to custom checks/i)).toBeInTheDocument();
        expect(screen.getByText(/0xabababab/i)).toBeInTheDocument();
      });

      expect(mockReadContract).not.toHaveBeenCalled();
      expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
    });

    it("should abort polling and show error when live transaction status is CANCELED", async () => {
      mockGetTransaction.mockResolvedValue({
        statusName: TransactionStatus.CANCELED
      });

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Creator Wallet Address/i), { target: { value: "0x2222222222222222222222222222222222222222" } });
      fireEvent.change(screen.getByLabelText(/Campaign Policy/i), { target: { value: "Disclosure ad hashtag required" } });
      fireEvent.change(screen.getByLabelText(/Budget/i), { target: { value: "1" } });

      mockReadContract.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Deploy & Fund/i }));

      await waitFor(() => {
        expect(screen.getByText(/Transaction Failed/i)).toBeInTheDocument();
        expect(screen.getByText(/Transaction reached failed status/i)).toBeInTheDocument();
      });

      expect(mockReadContract).not.toHaveBeenCalled();
      expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
    });

    it("should abort polling and show error on polling retry exhaustion", async () => {
      // Keep returning PENDING forever
      mockGetTransaction.mockResolvedValue({
        statusName: TransactionStatus.PENDING
      });

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /Connect Wallet/i }));
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Connect Wallet/i })).not.toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Creator Wallet Address/i), { target: { value: "0x2222222222222222222222222222222222222222" } });
      fireEvent.change(screen.getByLabelText(/Campaign Policy/i), { target: { value: "Disclosure ad hashtag required" } });
      fireEvent.change(screen.getByLabelText(/Budget/i), { target: { value: "1" } });

      mockReadContract.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /Deploy & Fund/i }));

      await waitFor(() => {
        expect(screen.getByText(/Polling Timeout/i)).toBeInTheDocument();
        expect(screen.getByText(/Transaction polling timed out/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      expect(mockReadContract).not.toHaveBeenCalled();
      expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
    });
  });
});
