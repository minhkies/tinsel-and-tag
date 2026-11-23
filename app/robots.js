/**
 * Dynamic robots.txt (served at /robots.txt).
 * Public pages are crawlable by search engines AND AI crawlers;
 * private rooms (/room/) and /api/ are blocked for everyone.
 */
export default function robots() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

  const aiCrawlers = [
    'GPTBot', // OpenAI (ChatGPT training & browsing)
    'OAI-SearchBot', // OpenAI (ChatGPT search)
    'ChatGPT-User',
    'PerplexityBot', // Perplexity AI
    'ClaudeBot', // Anthropic Claude
    'Claude-Web',
    'Google-Extended', // Google AI (Gemini / AI Overviews grounding)
    'Applebot-Extended', // Apple Intelligence
    'Amazonbot', // Alexa
    'Meta-ExternalAgent', // Meta AI
  ];

  const disallow = ['/room/', '/api/'];

  const rules = [
    // All crawlers: public pages only
    { userAgent: '*', allow: '/', disallow },
    // Explicit allow-list for AI crawlers — documents intent and survives
    // future rule changes
    ...aiCrawlers.map((userAgent) => ({ userAgent, allow: '/', disallow })),
  ];

  return {
    rules,
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
