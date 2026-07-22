import type { Metadata } from "next";
import "./application.css";

export const metadata: Metadata = {
  title: {
    default: "E-JLS · Jurnal Kegiatan Belajar Mengajar",
    template: "%s · E-JLS",
  },
  description: "Platform jurnal kegiatan belajar mengajar dan tata kelola akses sekolah.",
  applicationName: "E-JLS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
