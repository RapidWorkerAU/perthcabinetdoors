import "./globals.css";

export const metadata = {
  title: "Perth Cabinet Doors",
  description: "Custom cabinet doors made in Perth",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
