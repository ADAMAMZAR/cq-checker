"use client";

import type { MainTab } from "@/components/SubNavTabs";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import LandingPage from "@/components/LandingPage";

export default function Dashboard() {
  const router = useRouter();

  const handleNavigate = (tab: MainTab) => {
    if (tab === "assistant" || tab === "chat") {
      router.push("/assistant");
    } else if (tab === "audit" || tab === "registry" || tab === "editor") {
      router.push(`/checker?tab=${tab}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      <Header
        error={null}
        isLoading={false}
        isEvidenceLoading={false}
        onRefresh={() => {}}
        onGoHome={() => router.push("/")}
      />
      <div className="flex-1 flex flex-col">
        <LandingPage onNavigate={handleNavigate} />
      </div>
    </div>
  );
}
