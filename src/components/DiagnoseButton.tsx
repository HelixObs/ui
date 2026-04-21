"use client";

interface Props {
  entityID: string;
  instrumentID?: string;
}

export default function DiagnoseButton({ entityID, instrumentID }: Props) {
  function handleClick() {
    const url = `/sherlock/${encodeURIComponent(entityID)}${instrumentID ? `?instrument=${encodeURIComponent(instrumentID)}` : ""}`;
    window.open(url, "_blank");
  }

  return (
    <button
      onClick={handleClick}
      className="rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2 text-sm text-white transition-colors"
    >
      Diagnose with AI
    </button>
  );
}
