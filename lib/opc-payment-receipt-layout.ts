const rowStartY = 278;
const valueLineHeight = 43;
const rowGap = 38;
const valueMaxWidth = 880;

function wrappedLineCount(text: string, measureText: (value: string) => number) {
  let line = "";
  let lines = 1;
  for (const character of text || "—") {
    const candidate = line + character;
    if (line && measureText(candidate) > valueMaxWidth) {
      line = character;
      lines += 1;
    } else {
      line = candidate;
    }
  }
  return lines;
}

export function calculateOpcPaymentReceiptLayout(
  values: string[],
  measureText: (value: string) => number,
) {
  let nextRowY = rowStartY;
  for (const value of values) {
    nextRowY += (wrappedLineCount(value, measureText) - 1) * valueLineHeight + rowGap;
  }
  const footerBottom = nextRowY + 180;
  return {
    height: Math.max(1900, footerBottom + 60),
    footerBottom,
  };
}
