import { listRoomsForOrganizer } from "@crowdship/db";
import { currentOrganizer } from "@/lib/auth";
import { AdminHome, LoginForm } from "./admin-home";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const organizer = await currentOrganizer();
  if (!organizer) return <LoginForm />;
  const rooms = await listRoomsForOrganizer(organizer);
  return (
    <AdminHome
      rooms={rooms.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))}
      defaults={{
        repo: process.env.DEMO_GITHUB_REPOSITORY ?? "johntestrun123-bot/crowdship-demo-taskboard",
        productionUrl: process.env.DEMO_PRODUCTION_URL ?? "",
        provider: (process.env.CODING_AGENT_PROVIDER as "mock" | "devin" | "claude_code_action") ?? "mock",
      }}
    />
  );
}
