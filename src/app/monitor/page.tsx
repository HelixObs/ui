import { fetchMonitorPlots, type PlotConfig } from "@/lib/gateway";
import MonitorClient from "@/components/MonitorClient";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  let plots: PlotConfig[] = [];
  try {
    plots = await fetchMonitorPlots();
  } catch {
    // Gateway may not be running in dev — render empty state
  }
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-zinc-100 px-6 py-3">
        <h1 className="text-sm font-semibold text-zinc-900">Live Monitor</h1>
        <p className="text-xs text-zinc-500 mt-0.5">2D candidate plots — time vs y-axis, SNR as brightness</p>
      </div>
      <MonitorClient plots={plots} />
    </div>
  );
}
