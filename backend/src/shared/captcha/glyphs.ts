/**
 * A 5x7 bitmap font, carrying only the characters a challenge is allowed to use.
 *
 * The excluded ones are deliberate: 0/O, 1/I/L, 5/S, 8/B and 2/Z are the pairs
 * people mistype when the glyph is leaning and speckled, and a resident who
 * cannot sign in because a zero looked like an O is a worse outcome than a bot
 * getting one extra guess.
 */

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

const FONT: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
};

const ROWS: Record<string, string[]> = Object.fromEntries(
  Object.entries(FONT).map(([char, rows]) => [char, rows.split('|')]),
);

/** Every character a generated challenge may contain. */
export const CHALLENGE_ALPHABET = Object.keys(FONT);

/**
 * Coverage below which a sampled point counts as blank.
 *
 * Deliberately under half: see [glyphCoverage].
 */
export const INK_THRESHOLD = 0.4;

/**
 * Bilinear ink coverage at a continuous point in glyph space, where (0, 0) is
 * the top-left corner of the first cell and (GLYPH_WIDTH, GLYPH_HEIGHT) the
 * bottom-right of the last.
 *
 * Nearest-neighbour sampling would be simpler and is wrong here: every diagonal
 * in this font is a run of cells touching only at their corners, so blown up to
 * five screen pixels a cell, a nearest-neighbour K arrives as a scatter of
 * loose squares. Interpolating and thresholding below half closes those corners
 * into a stroke — coverage at a shared corner is exactly 0.5 — while leaving
 * straight edges within a rounding error of where they were.
 */
export function glyphCoverage(char: string, fx: number, fy: number): number {
  const rows = ROWS[char];
  if (!rows) return 0;

  // Cell centres sit at integer + 0.5, so shift before splitting into the
  // surrounding four.
  const gx = fx - 0.5;
  const gy = fy - 0.5;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;

  const ink = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= GLYPH_WIDTH || y >= GLYPH_HEIGHT) return 0;
    return rows[y][x] === '#' ? 1 : 0;
  };

  return (
    ink(x0, y0) * (1 - tx) * (1 - ty) +
    ink(x0 + 1, y0) * tx * (1 - ty) +
    ink(x0, y0 + 1) * (1 - tx) * ty +
    ink(x0 + 1, y0 + 1) * tx * ty
  );
}
