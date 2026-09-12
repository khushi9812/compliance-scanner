// Renders specimen label images on a canvas so the "try a specimen" gallery
// works fully offline with deterministic, realistic-looking evidence.

import type { LabelSample } from "./label-samples";

const PAPER = "#f5efe0";
const INK = "#241f1c";
const RED = "#8b1a1a";

/** Draw a deterministic specimen label and return it as a data URL. */
export function makeSyntheticLabel(sample: LabelSample): string {
  const w = 640;
  const h = 880;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Paper + faint print texture.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(36,31,28,0.05)";
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

  // Title.
  ctx.fillStyle = INK;
  ctx.font = "bold 44px 'IBM Plex Sans', sans-serif";
  ctx.fillText(sample.name.toUpperCase(), 44, 110);

  ctx.font = "20px 'IBM Plex Mono', monospace";
  ctx.fillText(`NET ${sample.name.match(/\d+\s*\w+$/)?.[0] ?? "100 g"}`, 44, 170);

  // Declaration block (varies per specimen id for layout diversity).
  const lines: string[] = [];
  if (sample.id === "muesli") {
    lines.push("MRP Rs 185 (incl. of all taxes)");
    lines.push("Net Wt. 500 g");
    lines.push("MFD 03/2026");
    lines.push("Manufactured by Sunrise Foods Pvt. Ltd.");
    lines.push("Customer Care: 1800-123-4567");
    lines.push("Country of Origin: India");
  } else if (sample.id === "shampoo") {
    lines.push("M.R.P ₹ 245.00");
    lines.push("Net Qty. 340 ml");
    lines.push("Pkd 11/25");
    lines.push("M/s Greenleaf Industries");
    lines.push("care@greenleaf.example.com");
    // Country of origin deliberately missing for this specimen.
  } else if (sample.id === "chips") {
    lines.push("MRP ₹ 35");
    lines.push("NET WT 80 g");
    lines.push("MFD 08/2025");
    lines.push("Manufactured by: Deccan Snacks Pvt Ltd");
    lines.push("Made in India");
    // Consumer-care missing for this specimen.
  } else {
    lines.push("1 L");
    lines.push("Rs.20/-");
    lines.push("Pack 04/2026");
    lines.push("Marketed by AquaPure Beverages Ltd.");
    lines.push("Consumer Care: +91 9876543210");
    lines.push("Country of Origin: India");
  }

  ctx.font = "26px 'IBM Plex Sans', sans-serif";
  let y = 260;
  for (const line of lines) {
    ctx.fillText(line, 44, y);
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
  ctx.fillText(sample.id.toUpperCase(), -52, 22);
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.92);
}
