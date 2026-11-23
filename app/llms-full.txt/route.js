import { buildLlmsFullTxt } from '@/lib/llms';

/**
 * Serves /llms-full.txt — the full markdown version of the site's public
 * content, intended for AI training crawlers and citation tools.
 */
export async function GET() {
  return new Response(buildLlmsFullTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
