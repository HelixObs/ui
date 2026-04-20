"use client";

import Link from "next/link";

export default function EntityError({ error }: { error: Error }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-zinc-400 text-sm">
        Could not load entity graph.
      </p>
      <p className="font-mono text-xs text-zinc-600 max-w-sm break-all">{error.message}</p>
      <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 underline">
        ← Search again
      </Link>
    </div>
  );
}
