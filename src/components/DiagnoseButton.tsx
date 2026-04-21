"use client";

import { useState } from "react";
import SherlockPanel from "./SherlockPanel";

interface Props {
  entityID: string;
  instrumentID?: string;
}

export default function DiagnoseButton({ entityID, instrumentID }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 text-sm text-white transition-colors"
      >
        Diagnose with AI
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex items-stretch">
          <SherlockPanel
            entityID={entityID}
            instrumentID={instrumentID}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
