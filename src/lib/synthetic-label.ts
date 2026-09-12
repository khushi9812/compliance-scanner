// Renders example label images on a canvas so every feature in the app can be
// demonstrated offline with deterministic, honest evidence: the text drawn on
// the canvas exactly matches the backend's pinned layout for that example.

import { sampleById } from "./label-samples";

const PAPER = "#f5efe0";
const INK = "#241f1c";
const RED = "#8b1a1a";

/** Declaration lines per example — mirrors pickLayout() in convex/ocr.ts. */
const LINES: Record<string, string[]> = {
  muesli: [
    "Crunchy Muesli 500g",
    "MRP Rs 185 (Inclusive of all taxes)",
    "Net Wt. 500 g",
    "MFD MM/YYYY 03/2026",
    "Manufactured by Sunrise Foods Pvt. Ltd.",
    "Customer Care: 1800-123-4567",
  ],
  shampoo: [
    "HERBAL SHAMPOO",
    "Net Qty. 340 ml",
    "M.R.P ₹ 245.00",
    "Pkd 11/25",
    "M/s Greenleaf Industries",
    "Country of Origin: India",
    "helpline care@example.com",
  ],
  chips: [
    "Masala Chips",
    "MRP ₹ 35",
    "NET WT 80 g",
    "Manufactured by: Deccan Snacks Pvt Ltd",
    "MFD 08/2025",
    "Made in India",
  ],
  water: [
    "MINERAL WATER",
    "1 L",
    "Rs.20/-",
    "Pack 04/2026",
    "Marketed by AquaPure Beverages Ltd.",
    "Consumer Care: +91 9876543210",
  ],
};

/** Draw a deterministic specimen label and return it as a JPEG data URL. */
export function makeSyntheticLabel(sampleId: string): string {
  const sample = sampleById(sampleId);
  if (!sample) throw new Error(`Unknown sample: ${sampleId}`);

  const w = 640;
  const h = 880;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // Paper + faint print texture.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(36,31,28,0.05)";
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Border frame.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // Title (first line of the panel).
  const lines = LINES[sampleId] ?? LINES.muesli;
  ctx.fillStyle = INK;
  ctx.font = "bold 40px 'IBM Plex Sans', sans-serif";
  ctx.fillText(lines[0].toUpperCase(), 40, 104);

  // Net-quantity caption under the title.
  ctx.font = "20px 'IBM Plex Mono', monospace";
  const netQty =
    sample.sizeOverride != null
      ? `NET ${sample.sizeOverride.value} ${sample.sizeOverride.unit}`
      : (lines[1] ?? "");
  ctx.fillText(netQty, 40, 156);

  // Declaration block: drawn text == backend layout lines for this example.
  let y = 250;
  for (const line of lines.slice(1)) {
    // The water example draws its non-₹ MRP in deliberately small print —
    // it demonstrates both the ₹ violation and a Fourth-Schedule font check.
    const isSmallPrint = sampleId === "water" && line.startsWith("Rs.");
    ctx.font = isSmallPrint
      ? "600 17px 'IBM Plex Sans', sans-serif"
      : "26px 'IBM Plex Sans', sans-serif";
    ctx.fillText(line, 40, y);
    y += 62;
  }

  // Stamp footer.
  ctx.save();
  ctx.translate(w - 170, h - 90);
  ctx.rotate((-6 * Math.PI) / 180);
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 3;
  ctx.strokeRect(-80, -30, 160, 60);
  ctx.font = "bold 18px 'IBM Plex Mono', monospace";
  ctx.fillText("SPECIMEN", -62, -2);
  ctx.fillText(sampleId.toUpperCase(), -52, 22);
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.92);
}
