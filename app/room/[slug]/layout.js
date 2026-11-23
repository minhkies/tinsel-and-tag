/**
 * Server layout for private Secret Santa rooms.
 * Keeps every user-created room out of Google/Bing entirely.
 */
export const metadata = {
  title: 'Secret Santa Room',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function RoomLayout({ children }) {
  return <>{children}</>;
}
