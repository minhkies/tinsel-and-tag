import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/LanguageContext";
import ClarityTracking from "@/components/ClarityTracking";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

const SITE_TITLE = 'Tinsel & Tag — Free Online Secret Santa Generator';
const SITE_DESCRIPTION =
  'Draw Secret Santa names for free — no accounts or emails. Smart exclusions, wishlists, and rooms protected by PIN or Face ID.';

// NOTE: replace /og-image.png below with a 1200x630 PNG in /public when you
// have one; until then the logo is used so social cards never break.
const OG_IMAGE = '/logo.png';

export const metadata = {
  metadataBase: new URL(`${siteUrl}/`),
  title: {
    default: SITE_TITLE,
    template: '%s | Tinsel and Tag',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'secret santa generator',
    'free secret santa',
    'online secret santa',
    'secret santa name picker',
    'gift exchange organizer',
    'christmas gift exchange',
    'secret santa wishlist',
  ],
  authors: [{ name: 'Tinsel & Tag' }],
  creator: 'Tinsel & Tag',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Tinsel & Tag',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Tinsel & Tag — Free online Secret Santa generator',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-[#1C1917]">
        <LanguageProvider>{children}</LanguageProvider>
        <ClarityTracking />
      </body>
    </html>
  );
}
