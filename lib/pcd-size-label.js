// HOW A SIZE IS WRITTEN IN A TABLE.
//
// The order page alone wrote the same door three ways: "745 x 392mm",
// "745mm x 392mm", and a small monospace "745mm x 392mm". One way now, height
// first like every size in the business, the unit once at the end, and a real
// multiplication sign so it reads as a dimension rather than a letter.
//
//   sizeLabel(745, 392)        "745 × 392mm"
//   sizeLabel(720, 600, 560)   "720 × 600 × 560mm"
//
// A missing side shows as a dash rather than dropping out, so a half recorded
// size still reads as a size with something missing, not as a smaller one.
//
// This is for screens. Order form labels have their own format in
// pcd-order-form-data.js, because the workbook parses them back.

const side = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(Math.round(number * 100) / 100) : "-";
};

export function sizeLabel(heightMm, widthMm, depthMm) {
  const hasDepth = Number(depthMm) > 0;
  if (side(heightMm) === "-" && side(widthMm) === "-") return "-";
  const parts = [side(heightMm), side(widthMm)];
  if (hasDepth) parts.push(side(depthMm));
  return `${parts.join(" × ")}mm`;
}
