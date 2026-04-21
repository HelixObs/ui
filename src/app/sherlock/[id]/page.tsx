"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import SherlockPanel from "@/components/SherlockPanel";

export default function SherlockPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const entityID = decodeURIComponent(id);
  const searchParams = useSearchParams();
  const instrumentID = searchParams.get("instrument") ?? undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <SherlockPanel
        entityID={entityID}
        instrumentID={instrumentID}
        fullPage
        onClose={() => window.close()}
      />
    </div>
  );
}
