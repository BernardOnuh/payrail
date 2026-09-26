import { AgentPanel } from "@/components/agent-panel";

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Agent</h1>
        <p className="mt-1 text-[14px] text-muted">Give an AI agent the same quoting and planning powers with the MCP server or the raw /v1 API.</p>
      </div>
      <AgentPanel />
    </div>
  );
}