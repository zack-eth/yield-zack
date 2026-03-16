const PDFDocument = require("pdfkit");
const fs = require("fs");

const doc = new PDFDocument({ size: "A4", margin: 40 });
doc.pipe(fs.createWriteStream("summary.pdf"));

const W = doc.page.width;
const M = 40; // margin
const CW = W - 2 * M; // content width

// --- Colors ---
const C = {
  bg: "#0F1419",
  card: "#1A2332",
  accent: "#F7931A", // bitcoin orange
  text: "#E8EAED",
  muted: "#9AA0A6",
  green: "#34A853",
  blue: "#4A90D9",
  purple: "#9B72CF",
  teal: "#00BFA5",
  border: "#2D3748",
};

// Full-page dark background
doc.rect(0, 0, W, doc.page.height).fill(C.bg);

// --- Header ---
let y = 35;
doc.fontSize(22).fillColor(C.accent).text("Lombard BTC DeFi Vault", M, y, { width: CW });
y += 28;
doc.fontSize(9).fillColor(C.muted).text("Technical Summary  •  Ethereum Mainnet Fork  •  BoringVault Architecture (Veda / Seven Seas)", M, y);
y += 22;
doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
y += 14;

// --- Overview ---
doc.fontSize(11).fillColor(C.accent).text("Overview", M, y);
y += 16;
doc.fontSize(8.5).fillColor(C.text).text(
  "This script interacts with the Lombard DeFi Vault on a Hardhat mainnet fork. " +
  "It deposits WBTC by bypassing the Teller (whose Solmate safeTransferFrom reverts on fork) " +
  "and directly calling vault.enter() as the impersonated Teller. " +
  "It then requests a delayed withdrawal via DelayedWithdraw. " +
  "Live vault metadata (APY, TVL) is fetched from DeFiLlama (veda/LBTCV pool). " +
  "All functions are exported and covered by 14 tests (npm test).",
  M, y, { width: CW, lineGap: 2.5 }
);
y += 56;

// ============================================================
// SYSTEM DIAGRAM
// ============================================================
doc.fontSize(11).fillColor(C.accent).text("System Diagram", M, y);
y += 18;

const diagramY = y;
const diagramH = 220;
doc.roundedRect(M, diagramY, CW, diagramH, 6).fill("#111820");
doc.roundedRect(M, diagramY, CW, diagramH, 6).strokeColor(C.border).lineWidth(0.5).stroke();

// 3-column, 2-row layout
const bw = 130;
const bh = 30;
const innerW = CW - 24;
const gap3 = (innerW - 3 * bw) / 2;
const bx = M + 12;
const r1y = diagramY + 32;
const col1 = bx;
const col2 = col1 + bw + gap3;
const col3 = col2 + bw + gap3;
const r2y = r1y + bh + 60;

// Row 1: User Wallet, BoringVault, Teller (impersonated)
// Row 2: DelayedWithdraw, Accountant, DeFiLlama
const boxes = [
  [col1, r1y, bw, bh, C.blue],
  [col2, r1y, bw, bh, C.purple],
  [col3, r1y, bw, bh, C.green],
  [col1, r2y, bw, bh, C.teal],
  [col2, r2y, bw, bh, "#E8B84D"],
  [col3, r2y, bw, bh, C.muted],
];
boxes.forEach(([bxx, byy, bww, bhh, color]) => {
  doc.save();
  doc.roundedRect(bxx, byy, bww, bhh, 4).fillColor(color).fillOpacity(0.08).fill();
  doc.restore();
  doc.roundedRect(bxx, byy, bww, bhh, 4).strokeColor(color).lineWidth(1).stroke();
});

// Arrow helper
function drawArrow(x1, y1, x2, y2, color) {
  const inset = 4;
  const ax1 = x1 + (x2 > x1 ? inset : -inset);
  const ax2 = x2 + (x2 > x1 ? -inset : inset);
  doc.moveTo(ax1, y1).lineTo(ax2, y2).strokeColor(color).lineWidth(1).stroke();
  const angle = Math.atan2(y2 - y1, ax2 - ax1);
  const hs = 5;
  doc.save();
  doc.moveTo(ax2, y2)
    .lineTo(ax2 - hs * Math.cos(angle - 0.4), y2 - hs * Math.sin(angle - 0.4))
    .lineTo(ax2 - hs * Math.cos(angle + 0.4), y2 - hs * Math.sin(angle + 0.4))
    .closePath().fill(color);
  doc.restore();
}

// DEPOSIT: User Wallet → BoringVault (wbtc.transfer)
drawArrow(col1 + bw, r1y + bh / 2 - 5, col2, r1y + bh / 2 - 5, C.accent);
// DEPOSIT: Teller → BoringVault (vault.enter)
drawArrow(col3, r1y + bh / 2 + 5, col2 + bw, r1y + bh / 2 + 5, C.green);
// WITHDRAW: User Wallet → DelayedWithdraw (vertical down)
drawArrow(col1 + bw / 2, r1y + bh, col1 + bw / 2, r2y, C.teal);
// PRICING: Accountant → BoringVault (vertical up)
drawArrow(col2 + bw / 2, r2y, col2 + bw / 2, r1y + bh, "#E8B84D");
// METADATA: DeFiLlama (dashed up)
doc.save();
const dx = col3 + bw / 2;
doc.moveTo(dx, r2y).lineTo(dx, r1y + bh + 6)
  .dash(3, { space: 3 }).strokeColor(C.muted).lineWidth(0.8).stroke();
doc.undash();
doc.restore();

// Box labels
const boxLabels = [
  { x: col1, y: r1y, w: bw, label: "User Wallet", sub: "Hardhat Account #0", color: C.blue },
  { x: col2, y: r1y, w: bw, label: "BoringVault", sub: "0x5401...7D57c", color: C.purple },
  { x: col3, y: r1y, w: bw, label: "Teller (impersonated)", sub: "0x2eA4...E9B3", color: C.green },
  { x: col1, y: r2y, w: bw, label: "DelayedWithdraw", sub: "0xDa75...E5a", color: C.teal },
  { x: col2, y: r2y, w: bw, label: "Accountant", sub: "0x2863...dCE", color: "#E8B84D" },
  { x: col3, y: r2y, w: bw, label: "DeFiLlama API", sub: "APY + TVL", color: C.muted },
];
boxLabels.forEach(({ x, y: by, w, label, sub, color }) => {
  doc.fontSize(7).fillColor(C.text).text(label, x, by + 6, { width: w, align: "center", lineBreak: false });
  doc.fontSize(5).fillColor(color).text(sub, x, by + 18, { width: w, align: "center", lineBreak: false });
});

// Arrow labels
const mid = (a, b) => (a + b) / 2;
doc.fontSize(5.5).fillColor(C.accent).text("wbtc.transfer()", mid(col1 + bw, col2) - 30, r1y + bh / 2 - 16, { width: 60, align: "center", lineBreak: false });
doc.fontSize(5.5).fillColor(C.green).text("vault.enter()", mid(col2 + bw, col3) - 30, r1y + bh / 2 - 6, { width: 60, align: "center", lineBreak: false });
doc.fontSize(5.5).fillColor(C.teal).text("requestWithdraw", col1 + bw / 2 + 5, mid(r1y + bh, r2y) - 3, { lineBreak: false });
doc.fontSize(5.5).fillColor("#E8B84D").text("getRateInQuote()", col2 + bw / 2 + 5, mid(r1y + bh, r2y) - 3, { lineBreak: false });
doc.fontSize(5.5).fillColor(C.muted).text("metadata", col3 + bw / 2 + 5, mid(r1y + bh + 6, r2y) - 3, { lineBreak: false });

// Flow legend
const flowY = r2y + bh + 14;
doc.fontSize(6.5).fillColor(C.accent).text("DEPOSIT: transfer WBTC + mint shares", col1, flowY, { lineBreak: false });
doc.fontSize(6.5).fillColor(C.teal).text("WITHDRAW: requestWithdraw()", col1, flowY + 10, { lineBreak: false });
doc.fontSize(6.5).fillColor("#E8B84D").text("PRICING / METADATA", col2 + bw / 2, flowY + 10, { lineBreak: false });

y = diagramY + diagramH + 14;

// ============================================================
// CONTRACT TABLE
// ============================================================
doc.fontSize(11).fillColor(C.accent).text("Contract Addresses", M, y);
y += 16;

const contracts = [
  ["BoringVault (LBTCv)", "0x5401b8620E5FB570064CA9114fd1e135fd77D57c", C.purple],
  ["Teller", "0x2eA43384F1A98765257bc6Cb26c7131dEbdEB9B3", C.green],
  ["Accountant", "0x28634D0c5edC67CF2450E74deA49B90a4FF93dCE", "#E8B84D"],
  ["DelayedWithdraw", "0xDa75512350c03d0F914eF040237E9ABF45913E5a", C.teal],
  ["WBTC Token", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", C.accent],
  ["RolesAuthority", "0xF3E03eF7df97511a52f31ea7a22329619db2bdF4", C.blue],
];

const tableX = M;
const nameW = 130;
const addrW = CW - nameW;

contracts.forEach(([name, addr, color], i) => {
  const rowY = y + i * 18;
  if (i % 2 === 0) doc.rect(tableX, rowY - 2, CW, 17).fill("#1A2332");
  doc.fontSize(7.5).fillColor(color).text(name, tableX + 6, rowY, { width: nameW });
  doc.font("Courier").fontSize(7).fillColor(C.text).text(addr, tableX + nameW, rowY + 0.5, { width: addrW });
  doc.font("Helvetica");
});

y += contracts.length * 18 + 10;

// ============================================================
// EXECUTION FLOW
// ============================================================
doc.fontSize(11).fillColor(C.accent).text("Execution Flow", M, y);
y += 16;

const steps = [
  ["1", "setupFork()", "Impersonate WBTC holder + auth owner in parallel; fund wallet and grant requestWithdraw capability"],
  ["2", "fetchMetadata()", "APY/TVL from DeFiLlama (veda/LBTCV pool); symbol + decimals read on-chain in parallel"],
  ["3", "deposit(signer)", "Transfer WBTC to vault, impersonate Teller to call vault.enter() — mints LBTCv shares to wallet"],
  ["4", "withdraw(signer, shares)", "Advance time past share lock, approve shares to DelayedWithdraw, call requestWithdraw()"],
  ["5", "Verify", "Read LBTCv balance before/after each step — confirms mint and transfer out (balance → 0)"],
];

steps.forEach(([num, title, desc], i) => {
  const rowY = y + i * 24;
  // number circle
  doc.circle(M + 8, rowY + 6, 7).fill(C.accent);
  doc.fontSize(7).fillColor(C.bg).text(num, M + 2, rowY + 2.5, { width: 12, align: "center" });
  doc.fontSize(8).fillColor(C.text).text(title, M + 22, rowY);
  doc.fontSize(7).fillColor(C.muted).text(desc, M + 22, rowY + 11, { width: CW - 30, lineGap: 1 });
});

y += steps.length * 24 + 8;

// --- Footer ---
doc.moveTo(M, y).lineTo(W - M, y).strokeColor(C.border).lineWidth(0.5).stroke();
y += 8;
doc.fontSize(7).fillColor(C.muted).text(
  "Stack: Node.js • ethers.js v6 • Hardhat v2 (mainnet fork) • DeFiLlama API  |  Architecture: Veda BoringVault  |  Network: Ethereum Mainnet",
  M, y, { width: CW, align: "center" }
);

doc.end();
console.log("Generated summary.pdf");
