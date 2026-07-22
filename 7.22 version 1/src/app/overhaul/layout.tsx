import type { Metadata } from "next";
import { StoreProvider } from "@/lib/overhaul/store";
import OverhaulShell from "@/components/overhaul/OverhaulShell";

export const metadata: Metadata = {
  title: "PlantSync Pro — 발전소 오버홀 공정관리",
  description: "발전소 정기 오버홀 공정 현황 관리",
};

export default function OverhaulLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="overhaul-scope">
      <StoreProvider>
        <OverhaulShell>{children}</OverhaulShell>
      </StoreProvider>
    </div>
  );
}
