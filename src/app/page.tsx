"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [entityID, setEntityID] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = entityID.trim();
    if (id) router.push(`/entity/${encodeURIComponent(id)}`);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">Provenance Graph</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Enter an entity ID to inspect its provenance DAG and event history.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-3 w-full max-w-md">
        <input
          type="text"
          value={entityID}
          onChange={(e) => setEntityID(e.target.value)}
          placeholder="e.g. frb-20260415-042"
          className="flex-1 rounded-md bg-white border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          View
        </button>
      </form>
    </div>
  );
}
