import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";

// Same type as task-2: Instrument Sans for the interface, Newsreader for answer text, Geist Mono for table excerpts.
const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "iMac Environmental Report Q&A",
  description:
    "Ask questions about the iMac Product Environmental Report (October 2024). Answers come only from the document and cite PDF pages.",
};

// Runs before the first paint: applies a theme saved by the toggle, so the page does not flash the OS theme first.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.classList.add(t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
