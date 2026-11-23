/**
 * Dynamic sitemap (served at /sitemap.xml).
 * Uses NEXT_PUBLIC_SITE_URL so it works on localhost, Vercel previews,
 * and the production domain without code changes.
 */
export default function sitemap() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    // Future public SEO landing pages go here with priority 0.8, e.g.:
    // { url: `${siteUrl}/how-it-works`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  ];
}
