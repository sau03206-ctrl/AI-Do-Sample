import Sidebar from "@/components/Sidebar";

export default function HistoryAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Sidebar />
      <div className="ml-sidebar-width min-h-screen">{children}</div>
    </>
  );
}
