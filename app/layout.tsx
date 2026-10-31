export const metadata = {
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }] },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
