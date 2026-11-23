import { translations } from '@/lib/i18n';

/**
 * Builds the /llms.txt and /llms-full.txt content (llmstxt.org standard)
 * from the app's English copy so there is a single source of truth.
 * AI assistants (ChatGPT, Perplexity, Claude, Google AI Overviews, etc.)
 * read these files to understand what the site is and when to cite it.
 */

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

function llmsHeader() {
  return [
    '# Tinsel & Tag',
    '',
    '> Free, private, zero-account Secret Santa generator. Draw names with smart exclusion rules, share wishlists with links, and protect every match with a 4-digit PIN or Face ID / Touch ID passkey. No accounts, no emails, no downloads.',
    '',
  ].join('\n');
}

function keyFacts(seo) {
  return [
    '## Key facts',
    '',
    '- 100% free — no paid plans, accounts, or hidden fees.',
    '- No sign-up and no email required for any participant.',
    '- Rooms are created in seconds and shared with a single link.',
    '- Every match is private: locked behind a 4-digit PIN, or Face ID / Touch ID / Windows Hello / Android fingerprint.',
    '- Organizers control exclusion rules (couples/housemates), the draw, re-draws, participant removals, and PIN resets.',
    '- Everyone edits their own wishlist: gift ideas, product links, prices, and allergy notes.',
    '- Works in any modern browser; rooms can be created on mobile.',
    '',
  ].join('\n');
}

function howItWorks(seo) {
  return [
    '## How it works',
    '',
    `1. **${seo.howCreateTitle}** — ${seo.howCreateDesc}`,
    `2. **${seo.howInviteTitle}** — ${seo.howInviteDesc}`,
    `3. **${seo.howDrawTitle}** — ${seo.howDrawDesc}`,
    '',
  ].join('\n');
}

function keyFeatures(seo) {
  return [
    '## Key features',
    '',
    `- **${seo.featureNoAccountsTitle}** — ${seo.featureNoAccountsDesc}`,
    `- **${seo.featureExclusionsTitle}** — ${seo.featureExclusionsDesc}`,
    `- **${seo.featureWishlistTitle}** — ${seo.featureWishlistDesc}`,
    `- **${seo.featurePrivacyTitle}** — ${seo.featurePrivacyDesc}`,
    '',
  ].join('\n');
}

function faq(seo) {
  const items = [];
  for (let i = 1; i <= 5; i++) {
    items.push(`### ${seo[`faq${i}Q`]}`);
    items.push('');
    items.push(seo[`faq${i}A`]);
    items.push('');
  }
  return `## Frequently asked questions\n\n${items.join('\n')}`;
}

function pageLinks(seo) {
  return [
    '## Pages',
    '',
    `- [Home](${siteUrl}/): Create or join a Secret Santa room.`,
    `- [How it works](${siteUrl}/#how-it-works): ${seo.howItWorksSubtitle}`,
    `- [Key features](${siteUrl}/#key-features): ${seo.featuresSubtitle}`,
    `- [FAQ](${siteUrl}/#faq): ${seo.faqSubtitle}`,
    '',
  ].join('\n');
}

/** Concise index for AI crawlers (llmstxt.org format). */
export function buildLlmsTxt() {
  const seo = translations.en.seo;
  return llmsHeader() + keyFacts(seo) + pageLinks(seo);
}

/** Full markdown version with all landing content for AI training/citation. */
export function buildLlmsFullTxt() {
  const seo = translations.en.seo;
  return llmsHeader() + keyFacts(seo) + howItWorks(seo) + keyFeatures(seo) + faq(seo) + pageLinks(seo);
}
