"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import LandingPage from "@/components/LandingPage";
import Footer from "@/components/Footer";

export default function Dashboard() {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col w-full">
      <div className="flex-1 flex flex-col w-full p-4 md:p-8">
        <Header
          error={null}
          isLoading={false}
          isEvidenceLoading={false}
          onRefresh={() => {}}
          hideHomeIcon={true}
        />
        <div className="flex-1 flex flex-col">
          <LandingPage />
        </div>
      </div>
      <Footer />
    </div>
  );
}
