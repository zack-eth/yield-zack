const hre = require("hardhat");
const { ethers } = require("ethers");

// --- Addresses (Ethereum Mainnet) ---
const VAULT = "0x5401b8620E5FB570064CA9114fd1e135fd77D57c";
const TELLER = "0x2eA43384F1A98765257bc6Cb26c7131dEbdEB9B3";
const ACCOUNTANT = "0x28634D0c5edC67CF2450E74deA49B90a4FF93dCE";
const DELAYED_WITHDRAW = "0xDa75512350c03d0F914eF040237E9ABF45913E5a";
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const AUTH = "0xF3E03eF7df97511a52f31ea7a22329619db2bdF4";
const AUTH_OWNER = "0xb7cB7131FFc18f87eEc66991BECD18f2FF70d2af";
const WBTC_HOLDER = "0xccF4429DB6322D5C611ee964527D42E5d685DD6a";
const WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat account #0

const DEPOSIT_SATS = 110n; // ~0.0000011 WBTC — enough to mint visible shares

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
];

// --- Helpers ---

function fmt(value, decimals, places = 6) {
  const str = ethers.formatUnits(value, decimals);
  const [whole, frac = ""] = str.split(".");
  return `${whole}.${frac.padEnd(places, "0").slice(0, places)}`;
}

// Wraps Hardhat's in-process provider for ethers v6 BrowserProvider,
// which calls eth_requestAccounts (unsupported by Hardhat).
const accounts = new Set([WALLET]);
const provider = new ethers.BrowserProvider({
  request: async ({ method, params }) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [...accounts];
    return hre.network.provider.request({ method, params });
  },
});

async function impersonate(addr) {
  await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await hre.network.provider.send("hardhat_setBalance", [addr, ethers.toBeHex(ethers.parseEther("1"))]);
  accounts.add(addr);
  return provider.getSigner(addr);
}

async function fetchMetadata() {
  let tvl = "N/A", apy = "N/A";
  try {
    const { data } = await (await fetch("https://yields.llama.fi/pools")).json();
    const pool = data.find(p => p.project === "veda" && p.chain === "Ethereum" && p.symbol === "LBTCV");
    if (pool) {
      apy = `${pool.apy.toFixed(2)}%`;
      if (pool.tvlUsd) tvl = `$${pool.tvlUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    }
  } catch {}
  return { apy, tvl };
}

async function setupFork() {
  const [holder, authOwner] = await Promise.all([
    impersonate(WBTC_HOLDER),
    impersonate(AUTH_OWNER),
  ]);
  const withdrawSig = ethers.id("requestWithdraw(address,uint96,uint16,bool)").slice(0, 10);
  await Promise.all([
    new ethers.Contract(WBTC, ERC20_ABI, holder).transfer(WALLET, 10_000n).then(tx => tx.wait()),
    new ethers.Contract(AUTH, ["function setPublicCapability(address, bytes4, bool)"], authOwner)
      .setPublicCapability(DELAYED_WITHDRAW, withdrawSig, true).then(tx => tx.wait()),
  ]);
}

async function deposit(signer) {
  const wbtc = new ethers.Contract(WBTC, ERC20_ABI, signer);
  const accountant = new ethers.Contract(ACCOUNTANT, [
    "function getRateInQuote(address) view returns (uint256)",
  ], provider);
  const vault = new ethers.Contract(VAULT, ERC20_ABI, signer);
  const decimals = await vault.decimals();

  const rateInQuote = await accountant.getRateInQuote(WBTC);
  const shares = (DEPOSIT_SATS * (10n ** BigInt(decimals))) / rateInQuote;

  await (await wbtc.transfer(VAULT, DEPOSIT_SATS)).wait();

  // Bypass Teller: its Solmate SafeTransferLib (inline assembly) reverts on
  // Hardhat's forked EVM. We replicate what Teller.deposit() does:
  //   1. Transfer WBTC from depositor to vault (above)
  //   2. Impersonate the Teller to call vault.enter() which mints shares
  const tellerSigner = await impersonate(TELLER);
  await (await new ethers.Contract(VAULT, [
    "function enter(address, address, uint256, address, uint256)",
  ], tellerSigner).enter(ethers.ZeroAddress, WBTC, 0n, WALLET, shares)).wait();

  return shares;
}

async function withdraw(signer, shares) {
  await hre.network.provider.send("evm_increaseTime", [86_401]);
  await hre.network.provider.send("evm_mine", []);

  const vault = new ethers.Contract(VAULT, ERC20_ABI, signer);
  await (await vault.approve(DELAYED_WITHDRAW, shares)).wait();
  await (await new ethers.Contract(DELAYED_WITHDRAW, [
    "function requestWithdraw(address, uint96, uint16, bool)",
  ], signer).requestWithdraw(WBTC, shares, 0, false)).wait();
}

// --- Main ---

async function main() {
  const signer = await provider.getSigner(WALLET);
  await setupFork();

  const vault = new ethers.Contract(VAULT, ERC20_ABI, signer);
  const [symbol, decimals, { apy, tvl }] = await Promise.all([
    vault.symbol(), vault.decimals(), fetchMetadata(),
  ]);

  console.log(`Vault: Lombard DeFi Vault`);
  console.log(`APY: ${apy}`);
  console.log(`TVL: ${tvl}`);
  console.log(`Token: ${symbol} (${decimals} decimals)`);
  console.log();
  console.log(`Wallet: ${WALLET}`);

  const balanceBefore = await vault.balanceOf(WALLET);
  console.log(`Balance before: ${fmt(balanceBefore, decimals)}`);

  console.log("Depositing...");
  await deposit(signer);

  const balanceAfter = await vault.balanceOf(WALLET);
  console.log(`Balance after: ${fmt(balanceAfter, decimals)}`);

  console.log("Withdrawing...");
  await withdraw(signer, balanceAfter);

  const balanceFinal = await vault.balanceOf(WALLET);
  console.log(`Balance final: ${fmt(balanceFinal, decimals)}`);
  console.log("✅ Complete!");
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = {
  fmt, impersonate, fetchMetadata, setupFork, deposit, withdraw,
  provider, VAULT, WBTC, WALLET, DELAYED_WITHDRAW, ERC20_ABI, DEPOSIT_SATS,
};
