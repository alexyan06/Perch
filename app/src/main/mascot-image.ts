import { Jimp, ResizeStrategy } from "jimp";

const CANVAS_SIZE = 64;
const PALETTE_SIZE = 24;

// The model doesn't reliably produce a real alpha channel when asked for a
// "transparent background" — observed in practice drawing a checkerboard
// pattern as literal pixel content instead (the visual convention for
// transparency, not the real thing). Requesting a solid, distinct chroma-key
// color and removing it here in code is far more reliable than hoping the
// model's own transparency support works — same principle NES/SNES-era
// sprite formats used a designated "this pixel is transparent" color for.
// Hue-based, not distance-from-pure-magenta: JPEG compression at fine edges
// (curly hair, etc.) darkens the chroma-key color without shifting its hue —
// observed fringe pixels like rgb(149,0,151) are unmistakably magenta-hued
// (R and B both far above G, and close to each other) despite being nowhere
// near (255,0,255) in Euclidean distance. A pure-distance threshold missed
// these; checking hue instead catches the compression-darkened case too.
const HUE_GAP_THRESHOLD = 40;
const RB_CLOSENESS_THRESHOLD = 40;

function looksMagenta(r: number, g: number, b: number): boolean {
  return (
    r - g > HUE_GAP_THRESHOLD &&
    b - g > HUE_GAP_THRESHOLD &&
    Math.abs(r - b) < RB_CLOSENESS_THRESHOLD
  );
}

// The deterministic consistency backstop from docs/mascot-generation.md §5:
// the model renders "pixel art" as a style at whatever resolution it wants,
// not a literal small grid — this is what actually guarantees every
// generated sprite ends up the same size/palette, in code rather than hoped
// for from the prompt.
export async function postProcessSprite(imageBase64: string): Promise<string> {
  const buffer = Buffer.from(imageBase64, "base64");
  const image = await Jimp.read(buffer);

  image.resize({
    w: CANVAS_SIZE,
    h: CANVAS_SIZE,
    mode: ResizeStrategy.NEAREST_NEIGHBOR,
  });

  // Hard cutout, not best-effort — every pixel ends up either fully
  // transparent (chroma-keyed) or fully opaque, nothing fuzzy in between.
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (_x, _y, idx) => {
    const r = image.bitmap.data[idx];
    const g = image.bitmap.data[idx + 1];
    const b = image.bitmap.data[idx + 2];
    image.bitmap.data[idx + 3] = looksMagenta(r, g, b) ? 0 : 255;
  });

  image.quantize({ colors: PALETTE_SIZE });

  return image.getBase64("image/png");
}
