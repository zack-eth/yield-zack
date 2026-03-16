const assert = require("assert");
const { ethers } = require("ethers");
const {
  fmt, impersonate, fetchMetadata, setupFork, deposit, withdraw,
  provider, VAULT, WBTC, WALLET, DELAYED_WITHDRAW, ERC20_ABI, DEPOSIT_SATS,
} = require("../index");

describe("fmt", function () {
  it("formats zero", function () {
    assert.strictEqual(fmt(0n, 8), "0.000000");
  });

  it("formats small values", function () {
    assert.strictEqual(fmt(100n, 8), "0.000001");
  });

  it("formats one full unit", function () {
    assert.strictEqual(fmt(100000000n, 8), "1.000000");
  });

  it("formats large values", function () {
    assert.strictEqual(fmt(2100000000000000n, 8), "21000000.000000");
  });

  it("respects custom decimal places", function () {
    assert.strictEqual(fmt(1n, 8, 2), "0.00");
    assert.strictEqual(fmt(100n, 8, 8), "0.00000100");
  });
});

describe("fetchMetadata", function () {
  it("returns apy and tvl strings", async function () {
    this.timeout(15_000);
    const { apy, tvl } = await fetchMetadata();
    assert.strictEqual(typeof apy, "string");
    assert.strictEqual(typeof tvl, "string");
    // Should have a % sign or be N/A
    assert.ok(apy.includes("%") || apy === "N/A", `unexpected apy: ${apy}`);
    assert.ok(tvl.startsWith("$") || tvl === "N/A", `unexpected tvl: ${tvl}`);
  });

  it("returns N/A when fetch fails", async function () {
    const originalFetch = global.fetch;
    global.fetch = () => Promise.reject(new Error("network down"));
    try {
      const { apy, tvl } = await fetchMetadata();
      assert.strictEqual(apy, "N/A");
      assert.strictEqual(tvl, "N/A");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("vault interactions (fork)", function () {
  this.timeout(120_000);

  let signer, vault;

  before(async function () {
    signer = await provider.getSigner(WALLET);
    vault = new ethers.Contract(VAULT, ERC20_ABI, signer);
    await setupFork();
  });

  describe("setupFork", function () {
    it("funds wallet with WBTC", async function () {
      const wbtc = new ethers.Contract(WBTC, ERC20_ABI, provider);
      const balance = await wbtc.balanceOf(WALLET);
      assert.ok(balance >= 10_000n, `expected >= 10000 sats, got ${balance}`);
    });

    it("vault token is LBTCv with 8 decimals", async function () {
      const [symbol, decimals] = await Promise.all([vault.symbol(), vault.decimals()]);
      assert.strictEqual(symbol, "LBTCv");
      assert.strictEqual(Number(decimals), 8);
    });
  });

  describe("deposit", function () {
    let balanceBefore, balanceAfter, expectedShares;

    before(async function () {
      const accountant = new ethers.Contract(
        "0x28634D0c5edC67CF2450E74deA49B90a4FF93dCE",
        ["function getRateInQuote(address) view returns (uint256)"],
        provider,
      );
      const rateInQuote = await accountant.getRateInQuote(WBTC);
      expectedShares = (DEPOSIT_SATS * (10n ** 8n)) / rateInQuote;

      balanceBefore = await vault.balanceOf(WALLET);
      await deposit(signer);
      balanceAfter = await vault.balanceOf(WALLET);
    });

    it("mints shares to wallet", function () {
      assert.ok(balanceAfter > balanceBefore, "balance should increase after deposit");
    });

    it("mints correct number of shares", function () {
      const minted = balanceAfter - balanceBefore;
      assert.strictEqual(minted, expectedShares, `expected ${expectedShares} shares, got ${minted}`);
    });

    it("shows non-zero balance in fmt", function () {
      const formatted = fmt(balanceAfter, 8);
      assert.ok(formatted !== "0.000000", `expected non-zero formatted balance, got ${formatted}`);
    });
  });

  describe("withdraw", function () {
    it("reverts without approval", async function () {
      const shares = await vault.balanceOf(WALLET);
      assert.ok(shares > 0n, "should have shares");

      // Revoke any prior approval
      await (await vault.approve(DELAYED_WITHDRAW, 0n)).wait();

      try {
        await new ethers.Contract(DELAYED_WITHDRAW, [
          "function requestWithdraw(address, uint96, uint16, bool)",
        ], signer).requestWithdraw(WBTC, shares, 0, false);
        assert.fail("should have reverted");
      } catch (e) {
        assert.ok(
          e.code === "CALL_EXCEPTION" || (e.message && !e.message.includes("should have")),
          `unexpected error: ${e.message}`,
        );
      }
    });

    it("transfers shares out of wallet", async function () {
      const sharesBefore = await vault.balanceOf(WALLET);
      assert.ok(sharesBefore > 0n, "should have shares to withdraw");

      await withdraw(signer, sharesBefore);

      const sharesAfter = await vault.balanceOf(WALLET);
      assert.strictEqual(sharesAfter, 0n, `expected 0 shares, got ${sharesAfter}`);
    });
  });
});
