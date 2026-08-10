"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MatrixPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin?tab=matrix");
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center p-12 text-[var(--text-tertiary)] text-sm font-medium">
      Redirecting to Admin Comparison Matrix...
    </div>
  );
}
