import fs from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const interPath = 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff';
const barlowPath = 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff';

const pages: Record<string, { title: string; subtitle: string }> = {
  index: {
    title: 'Emiliano G.O.',
    subtitle: 'Backend Engineer \u00b7 Data Scientist',
  },
  projects: {
    title: 'Projects',
    subtitle: 'DBWarden \u00b7 schemap \u00b7 crxml \u00b7 and more',
  },
};

export async function getStaticPaths() {
  return Object.keys(pages).map((slug) => ({ params: { slug } }));
}

export async function GET({ params }: { params: { slug: string } }) {
  const page = pages[params.slug];
  if (!page) {
    return new Response('Not found', { status: 404 });
  }

  const [interFont, barlowFont] = await Promise.all([
    fs.readFile(interPath),
    fs.readFile(barlowPath),
  ]);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#111616',
          fontFamily: 'Inter',
          padding: '80px',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#5a9e8a',
                marginBottom: 16,
              },
              children: 'emiliano-go.com',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                width: 60,
                height: 3,
                background: '#3a6e5a',
                marginBottom: 32,
              },
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontFamily: 'Barlow Condensed',
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: '0.025em',
                textTransform: 'uppercase',
                color: '#eef6f2',
                textAlign: 'center',
                lineHeight: 1.1,
                marginBottom: 24,
              },
              children: page.title,
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: 20,
                color: '#aad4c8',
                textAlign: 'center',
                lineHeight: 1.6,
                maxWidth: 600,
              },
              children: page.subtitle,
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: interFont, weight: 400, style: 'normal' },
        { name: 'Barlow Condensed', data: barlowFont, weight: 700, style: 'normal' },
      ],
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  });
  const pngData = resvg.render();
  const png = pngData.asPng();

  return new Response(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
