import type { AgentProviderName } from "@crowdship/shared";
import { ClaudeCodeActionProvider, DevinProvider, GitHubClient, MockCodingAgentProvider, type CodingAgentProvider } from "@crowdship/integrations";

export interface Deps {
  provider(name: AgentProviderName, repo: string): CodingAgentProvider;
  github(): GitHubClient | null;
}

/**
 * Real dependency wiring. A room's provider is fixed at creation; a Devin room
 * with missing credentials throws a config error. It never falls back to mock.
 */
export const realDeps: Deps = {
  provider(name, repo) {
    switch (name) {
      case "devin":
        return new DevinProvider();
      case "claude_code_action":
        return new ClaudeCodeActionProvider(repo);
      case "mock":
        return new MockCodingAgentProvider();
    }
  },
  github() {
    return process.env.GITHUB_TOKEN ? new GitHubClient() : null;
  },
};
