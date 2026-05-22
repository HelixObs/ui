import MonitorClient from "@/components/MonitorClient";

export default function MonitorPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-zinc-100 px-6 py-3">
        <h1 className="text-sm font-semibold text-zinc-900">Data Monitor</h1>
        <p className="text-xs text-zinc-500 mt-0.5">2D entity plots — time vs any metadata field, coloured by weight</p>
      </div>
      <MonitorClient />
    </div>
  );
}
