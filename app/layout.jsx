import Script from "next/script";

import "../styles.css";

export default function RootLayout({ children }) {
  return (
    <html lang="nb">
      <body>
        {children}
        <Script src="/script.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
