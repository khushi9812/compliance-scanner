// Renders example label images on a canvas so every feature in the app can be
// demonstrated offline with deterministic, honest evidence: the text drawn on
// the canvas is EXACTLY the panel text defined in specimens.ts (PANELS), which
// is also what the pinned VisionAnalysis quotes. Nothing is simulated twice.

import { PANELS, SPEC_LAYOUT } from "./specimens";

const PAPER = "#f5efe0";
const INK = "#241f1c";
const RED = "#8b1a1a";

/** Draw a deterministic EAN-style bar block for the given digits. */
function drawBarcode(
  ctx: CanvasRenderingContext2D,
  digits: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = INK;
  const bars = 44;
  const barW = w / (bars * 2);
  for (let i = 0; i < bars; i++) {
    const d = parseInt(digits[i % digits.length] ?? "0", 10);
    const barHeight = h * 0.62 - (d % 4) * 2;
    const bx = x + i * barW * 2;
    if (d % 2 === 0 || d > 4) {
      ctx.fillRect(bx, y, barW, barHeight);
    } else {
      ctx.fillRect(bx, y, barW * 0.6, barHeight);
    }
  }
  ctx.font = "16px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(digits, x + w / 2, y + h * 0.62 + 22);
  ctx.textAlign = "left";
}

/** Draw a deterministic specimen label and return it as a JPEG data URL. */
export function makeSyntheticLabel(sampleId: string): string {
  const panel = PANELS[sampleId];
  if (!panel) throw new Error(`Unknown sample: ${sampleId}`);

  const w = SPEC_LAYOUT.width;
  const h = SPEC_LAYOUT.height;
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

  // Title + net-quantity caption.
  ctx.fillStyle = INK;
  ctx.font = "bold 40px 'IBM Plex Sans', sans-serif";
  ctx.fillText(panel.title.toUpperCase(), 40, SPEC_LAYOUT.titleBaseline);
  ctx.font = "20px 'IBM Plex Mono', monospace";
  ctx.fillText(panel.caption, 40, SPEC_LAYOUT.captionBaseline);

  // Declaration block: small-flagged lines are drawn in deliberately tiny
  // print (demonstrates the Fourth-Schedule character-height checks).
  let y = SPEC_LAYOUT.lineTop;
  panel.lines.forEach((line, i) => {
    ctx.font = line.small
      ? "600 15px 'IBM Plex Sans', sans-serif"
      : "24px 'IBM Plex Sans', sans-serif";
    ctx.fillText(line.text, 40, y + (line.small ? 16 : 24));
    y += SPEC_LAYOUT.lineStep;
    void i;
  });

  // Barcode block (bars + printed digits) — y matches barcodeBox() in
  // specimens.ts so the pinned evidence boxes land exactly on the bars.
  const bb = {
    x: 40,
    y: SPEC_LAYOUT.lineTop + panel.lines.length * SPEC_LAYOUT.lineStep + 34,
    w: SPEC_LAYOUT.barcodeW,
    h: SPEC_LAYOUT.barcodeH,
  };
  drawBarcode(ctx, panel.barcode, bb.x, bb.y, bb.w, bb.h);

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
