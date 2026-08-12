"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

const Chatbot = dynamic(() => import("@/components/Chatbot"), { ssr: false });

export default function AssistantPage() {
  const router = useRouter();
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleGoHome = () => {
    router.push("/");
  };

  const handleRefresh = () => {
    setGlobalError(null);
  };

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      <Header
        error={globalError}
        isLoading={false}
        isEvidenceLoading={false}
        onRefresh={handleRefresh}
        onGoHome={handleGoHome}
      />
      <div className="flex-1 flex flex-col">
        <Chatbot onGoHome={handleGoHome} />
      </div>
    </div>
  );
}
