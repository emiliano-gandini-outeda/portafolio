import fs from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Same display face as the header logo (Nav.astro), read straight from the
// package so the card can never drift from what the site renders.
const barlowPath = 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff';

const GREEN = '#5a9e8a'; // --color-accent
const INK = '#111616'; // --color-bg
const WHITE = '#ffffff';

// satori does not apply text-transform, so the copy is uppercased here.
const word = (text: string, color: string) => ({
  type: 'span',
  props: {
    style: { color },
    children: text,
  },
});

export async function GET() {
  const barlowFont = await fs.readFile(barlowPath);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: 1200,
          height: 630,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: GREEN,
          fontFamily: 'Barlow Condensed',
          fontWeight: 700,
          fontSize: 150,
          letterSpacing: '0.06em',
        },
        children: [word('EMILIANO ', INK), word('G.O.', WHITE)],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Barlow Condensed', data: barlowFont, weight: 700, style: 'normal' }],
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

  return new Response(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
