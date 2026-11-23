/**
 * Server layout for the private room-admin pages.
 * Keeps every admin page out of Google/Bing entirely.
 */
export const metadata = {
  title: 'Room Admin',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminLayout({ children }) {
  return <>{children}</>;
}
