"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import EAuctionGenerator from "@/components/EAuctionGenerator";

export default function AuctionPage() {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      <Header
        error={null}
        isLoading={false}
        isEvidenceLoading={false}
        onRefresh={() => {}}
        onGoHome={() => router.push("/")}
      />
      <div className="flex-1 flex flex-col mt-4">
        <EAuctionGenerator />
      </div>
    </div>
  );
}
