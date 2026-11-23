/**
 * Renders a JSON-LD structured-data <script> tag for search engines.
 *
 * Safe to use from server or client components — Next.js includes the markup
 * in the server-rendered HTML either way. `<` characters in the payload are
 * escaped so the data can never break out of the script tag.
 */
export default function JsonLdSchema({ data }) {
  if (!data) return null;

  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
