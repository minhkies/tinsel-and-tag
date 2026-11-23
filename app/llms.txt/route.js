import { buildLlmsTxt } from '@/lib/llms';

/**
 * Serves /llms.txt — a concise markdown index of the site for AI crawlers
 * and assistants (llmstxt.org standard).
 */
export async function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
