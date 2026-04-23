# GitLab Webhook Event Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send concise Lark cards for common GitLab webhook events while logging and ignoring unsupported events without throwing.

**Architecture:** Keep `src/worker.ts` unchanged and concentrate the behavior in `src/gitlabHandler.ts`. Add a formatter registry that normalizes GitLab event kinds, returns a common card model, renders it through the existing interactive-card helper, and sends through the existing robot interface.

**Tech Stack:** TypeScript, Cloudflare Workers, Lark/Feishu custom bot interactive cards, Vitest, `gitlab-event-types`.

---

## File Structure

- Modify `src/gitlabHandler.ts`: add event-kind normalization, defensive field helpers, formatter registry, optional card header template support, and non-fatal unsupported-event result handling.
- Modify `src/__tests__/gitlab.spec.ts`: preserve the existing note snapshot test and add focused tests for representative supported events, unsupported events, and `event_type` fallback routing.
- Keep `src/worker.ts` unchanged: the handler continues returning a JSON-serializable result.

## Task 1: Add Handler Tests

**Files:**

- Modify: `src/__tests__/gitlab.spec.ts`
- Existing fixture: `src/__tests__/fixtures/note.json`

- [ ] **Step 1: Replace the test file with expanded coverage**

```ts
import { describe, expect, vi, test, afterEach } from "vitest";
import { handleGitlabWebhook } from "../gitlabHandler";
import type { LarkRobot } from "../lark/robot";
import note from "./fixtures/note.json";

const createMockRobot = (): LarkRobot => ({
  send: vi.fn(() => Promise.resolve({ code: 1, msg: "" })),
});

const expectInteractiveCardSent = async (event: Record<string, any>) => {
  const mockRobot = createMockRobot();

  await handleGitlabWebhook(event as any, mockRobot);

  expect(mockRobot.send).toBeCalledTimes(1);
  const [message] = vi.mocked(mockRobot.send).mock.calls[0];
  expect(message.msg_type).toBe("interactive");
  expect(message.card.header.title.content.length).toBeGreaterThan(0);
  expect(message.card.elements.length).toBeGreaterThan(0);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gitlab", () => {
  test("should send data match snapshot", async () => {
    const mockRobot: LarkRobot = {
      send: vi.fn((...args) => {
        expect(args).toMatchSnapshot();
        return Promise.resolve({ code: 1, msg: "" });
      }),
    };
    await handleGitlabWebhook(note as any, mockRobot);
    expect(mockRobot.send).toBeCalledTimes(1);
  });

  test.each([
    [
      "push",
      {
        object_kind: "push",
        ref: "refs/heads/main",
        user_name: "Ada",
        total_commits_count: 2,
        project: { name: "demo", web_url: "https://gitlab.example/demo" },
        commits: [
          { title: "feat: demo", url: "https://gitlab.example/demo/commit/1" },
        ],
      },
    ],
    [
      "tag_push",
      {
        object_kind: "tag_push",
        ref: "refs/tags/v1.0.0",
        user_name: "Ada",
        project: { name: "demo", web_url: "https://gitlab.example/demo" },
      },
    ],
    [
      "merge_request",
      {
        object_kind: "merge_request",
        user: { name: "Ada" },
        project: { name: "demo" },
        object_attributes: {
          action: "open",
          title: "Add webhook support",
          source_branch: "feature/events",
          target_branch: "main",
          url: "https://gitlab.example/demo/-/merge_requests/1",
        },
      },
    ],
    [
      "issue",
      {
        object_kind: "issue",
        user: { name: "Ada" },
        project: { name: "demo" },
        object_attributes: {
          action: "open",
          title: "Fix webhook",
          state: "opened",
          url: "https://gitlab.example/demo/-/issues/1",
        },
      },
    ],
    [
      "pipeline",
      {
        object_kind: "pipeline",
        user: { name: "Ada" },
        project: { name: "demo", web_url: "https://gitlab.example/demo" },
        object_attributes: {
          id: 12,
          status: "success",
          ref: "main",
          url: "https://gitlab.example/demo/-/pipelines/12",
        },
      },
    ],
    [
      "build",
      {
        object_kind: "build",
        user: { name: "Ada" },
        project_name: "demo",
        ref: "main",
        build_name: "test",
        build_stage: "test",
        build_status: "failed",
        build_url: "https://gitlab.example/demo/-/jobs/1",
      },
    ],
    [
      "deployment",
      {
        object_kind: "deployment",
        status: "success",
        environment: "production",
        project: { name: "demo" },
        deployable_url: "https://gitlab.example/demo/-/jobs/2",
      },
    ],
    [
      "wiki_page",
      {
        object_kind: "wiki_page",
        user: { name: "Ada" },
        project: { name: "demo" },
        object_attributes: {
          action: "create",
          title: "Runbook",
          url: "https://gitlab.example/demo/-/wikis/Runbook",
        },
      },
    ],
    [
      "release",
      {
        object_kind: "release",
        project: { name: "demo", web_url: "https://gitlab.example/demo" },
        name: "v1.0.0",
        action: "create",
        url: "https://gitlab.example/demo/-/releases/v1.0.0",
      },
    ],
    [
      "emoji",
      {
        object_kind: "emoji",
        event_type: "award",
        user: { name: "Ada" },
        project: { name: "demo" },
        object_attributes: { name: "thumbsup", action: "award" },
      },
    ],
    [
      "feature_flag",
      {
        object_kind: "feature_flag",
        project: { name: "demo" },
        object_attributes: {
          name: "new-ui",
          action: "update",
          active: true,
          url: "https://gitlab.example/demo/-/feature_flags/1",
        },
      },
    ],
    [
      "milestone",
      {
        object_kind: "milestone",
        project: { name: "demo" },
        object_attributes: {
          title: "v1",
          action: "close",
          state: "closed",
          url: "https://gitlab.example/demo/-/milestones/1",
        },
      },
    ],
    [
      "vulnerability",
      {
        object_kind: "vulnerability",
        project: { name: "demo" },
        object_attributes: {
          title: "CVE example",
          state: "confirmed",
          severity: "high",
          url: "https://gitlab.example/demo/-/security/vulnerabilities/1",
        },
      },
    ],
    [
      "work_item",
      {
        object_kind: "work_item",
        project: { name: "demo" },
        object_attributes: {
          title: "Plan work",
          action: "update",
          work_item_type: "Task",
          url: "https://gitlab.example/demo/-/work_items/1",
        },
      },
    ],
    [
      "member",
      {
        object_kind: "member",
        event_name: "user_add_to_group",
        group_name: "platform",
        user_name: "Ada",
      },
    ],
    [
      "project",
      {
        object_kind: "project",
        event_name: "project_create",
        name: "demo",
        path_with_namespace: "platform/demo",
        web_url: "https://gitlab.example/platform/demo",
      },
    ],
    [
      "subgroup",
      {
        object_kind: "subgroup",
        event_name: "subgroup_create",
        group_name: "platform/backend",
        web_url: "https://gitlab.example/groups/platform/backend",
      },
    ],
  ])("sends an interactive card for %s events", async (_, event) => {
    await expectInteractiveCardSent(event);
  });

  test("routes by event_type when object_kind is missing", async () => {
    await expectInteractiveCardSent({
      event_type: "push",
      ref: "refs/heads/main",
      user_name: "Ada",
      project: { name: "demo", web_url: "https://gitlab.example/demo" },
    });
  });

  test("logs and ignores unsupported events", async () => {
    const mockRobot = createMockRobot();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await handleGitlabWebhook(
      {
        object_kind: "new_event",
        event_type: "new_event",
      } as any,
      mockRobot,
    );

    expect(mockRobot.send).not.toBeCalled();
    expect(warn).toBeCalledWith("Unsupported GitLab webhook event", {
      kind: "new_event",
      objectKind: "new_event",
      eventType: "new_event",
    });
    expect(result).toEqual({
      ignored: true,
      reason: "unsupported_event",
      kind: "new_event",
    });
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `corepack pnpm vitest run src/__tests__/gitlab.spec.ts`

Expected: FAIL because supported non-note events do not call `robot.send`, and unsupported events currently log `Unknown event:` and return `undefined`.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/__tests__/gitlab.spec.ts
git commit -m "test: cover gitlab webhook event routing"
```

## Task 2: Implement Formatter Registry

**Files:**

- Modify: `src/gitlabHandler.ts`
- Test: `src/__tests__/gitlab.spec.ts`

- [ ] **Step 1: Update `makeInteractiveCard` to accept a header template**

Add a `template` option with default `"purple"`:

```ts
type LarkCardTemplate =
  | "blue"
  | "wathet"
  | "turquoise"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "carmine"
  | "violet"
  | "purple"
  | "indigo"
  | "grey";

export const makeInteractiveCard = ({
  title,
  content,
  url,
  at,
  atAll,
  template = "purple",
}: {
  title: string;
  content: string;
  url?: string;
  at?: string[];
  atAll?: boolean;
  template?: LarkCardTemplate;
}) =>
```

Then change the header from `template: "purple"` to:

```ts
template,
```

- [ ] **Step 2: Add common event model and defensive helpers**

Add these definitions below `makeInteractiveCard`:

```ts
type GitlabWebhookPayload = Record<string, any>;

type GitlabCardModel = {
  title: string;
  content: string;
  url?: string;
  template?: LarkCardTemplate;
};

type GitlabEventFormatter = (
  event: GitlabWebhookPayload,
  kind: string,
) => GitlabCardModel;

const asRecord = (value: unknown): GitlabWebhookPayload =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as GitlabWebhookPayload)
    : {};

const stringValue = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
};

const compactLines = (lines: Array<string | undefined>) =>
  lines.filter(Boolean).join("\n");

const line = (label: string, value: unknown) => {
  const text = stringValue(value);
  return text ? `**${label}:** ${text}` : undefined;
};

const objectAttributes = (event: GitlabWebhookPayload) =>
  asRecord(event.object_attributes);

const projectName = (event: GitlabWebhookPayload) => {
  const project = asRecord(event.project);
  return firstString(
    project.name,
    event.project_name,
    event.name,
    event.group_name,
    event.path_with_namespace,
    "GitLab",
  );
};

const projectUrl = (event: GitlabWebhookPayload) => {
  const project = asRecord(event.project);
  return firstString(project.web_url, event.web_url);
};

const userName = (event: GitlabWebhookPayload) => {
  const user = asRecord(event.user);
  return firstString(user.name, event.user_name, event.user_username);
};

const refName = (ref: unknown) => {
  const text = stringValue(ref);
  return text?.replace(/^refs\/(?:heads|tags)\//, "");
};

const titleWithAction = (
  event: GitlabWebhookPayload,
  label: string,
  action?: unknown,
) => compactLines([projectName(event), label, stringValue(action)])
  .replace(/\n/g, " ");
```

- [ ] **Step 3: Add event kind normalization**

```ts
const normalizeGitlabEventKind = (kind: unknown) =>
  stringValue(kind)?.trim().toLowerCase().replace(/\s+/g, "_");

const getGitlabEventKind = (event: GitlabWebhookPayload) =>
  normalizeGitlabEventKind(event.object_kind) ??
  normalizeGitlabEventKind(event.event_type);
```

- [ ] **Step 4: Add formatter registry**

Add a `formatters` object with one concise formatter per supported event kind. The `note` formatter must preserve the existing Chinese title and body shape so the current snapshot remains stable.

```ts
const formatters: Record<string, GitlabEventFormatter> = {
  push: (event) => {
    const commit = asRecord(event.commits?.[0]);
    return {
      title: titleWithAction(event, "push"),
      content: compactLines([
        line("Ref", refName(event.ref)),
        line("User", userName(event)),
        line("Commits", event.total_commits_count),
        line("Latest", firstString(commit.title, commit.message)),
      ]),
      url: firstString(commit.url, projectUrl(event)),
      template: "blue",
    };
  },

  tag_push: (event) => ({
    title: titleWithAction(event, "tag push"),
    content: compactLines([
      line("Tag", refName(event.ref)),
      line("User", userName(event)),
      line("Before", event.before),
      line("After", event.after),
    ]),
    url: projectUrl(event),
    template: "blue",
  }),

  merge_request: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "merge request", attrs.action),
      content: compactLines([
        line("Title", attrs.title),
        line("Author", userName(event)),
        line(
          "Branches",
          firstString(attrs.source_branch) && firstString(attrs.target_branch)
            ? `${attrs.source_branch} -> ${attrs.target_branch}`
            : undefined,
        ),
        line("State", attrs.state),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "purple",
    };
  },

  note: (event) => {
    const attrs = objectAttributes(event);
    const mr = asRecord(event.merge_request);
    return {
      title: `${projectName(event)} 有新的评论`,
      content: compactLines([
        stringValue(mr.title) ? `**${mr.title}**` : undefined,
        stringValue(attrs.note),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "purple",
    };
  },

  issue: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "issue", attrs.action),
      content: compactLines([
        line("Title", attrs.title),
        line("Author", userName(event)),
        line("State", attrs.state),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "orange",
    };
  },

  pipeline: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "pipeline", attrs.status),
      content: compactLines([
        line("Pipeline", attrs.id),
        line("Ref", attrs.ref),
        line("User", userName(event)),
        line("Status", attrs.status),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: attrs.status === "failed" ? "red" : "green",
    };
  },

  build: (event) => ({
    title: titleWithAction(event, "job", event.build_status),
    content: compactLines([
      line("Job", event.build_name),
      line("Stage", event.build_stage),
      line("Ref", refName(event.ref)),
      line("User", userName(event)),
      line("Status", event.build_status),
    ]),
    url: firstString(event.build_url, projectUrl(event)),
    template: event.build_status === "failed" ? "red" : "green",
  }),

  deployment: (event) => ({
    title: titleWithAction(event, "deployment", event.status),
    content: compactLines([
      line("Environment", event.environment),
      line("Tier", event.environment_tier),
      line("Status", event.status),
    ]),
    url: firstString(event.deployable_url, projectUrl(event)),
    template: event.status === "failed" ? "red" : "green",
  }),

  wiki_page: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "wiki page", attrs.action),
      content: compactLines([
        line("Title", attrs.title),
        line("User", userName(event)),
        line("Action", attrs.action),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "wathet",
    };
  },

  release: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "release", firstString(event.action, attrs.action)),
      content: compactLines([
        line("Release", firstString(event.name, attrs.name, attrs.tag)),
        line("Action", firstString(event.action, attrs.action)),
      ]),
      url: firstString(event.url, attrs.url, projectUrl(event)),
      template: "green",
    };
  },

  emoji: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "emoji", firstString(attrs.action, event.event_type)),
      content: compactLines([
        line("Emoji", attrs.name),
        line("User", userName(event)),
        line("Action", firstString(attrs.action, event.event_type)),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "yellow",
    };
  },

  feature_flag: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "feature flag", attrs.action),
      content: compactLines([
        line("Flag", attrs.name),
        line("Active", attrs.active),
        line("Action", attrs.action),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "indigo",
    };
  },

  milestone: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "milestone", attrs.action),
      content: compactLines([
        line("Title", attrs.title),
        line("State", attrs.state),
        line("Action", attrs.action),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "grey",
    };
  },

  vulnerability: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "vulnerability", attrs.state),
      content: compactLines([
        line("Title", attrs.title),
        line("Severity", attrs.severity),
        line("State", attrs.state),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: attrs.severity === "critical" || attrs.severity === "high" ? "red" : "orange",
    };
  },

  work_item: (event) => {
    const attrs = objectAttributes(event);
    return {
      title: titleWithAction(event, "work item", attrs.action),
      content: compactLines([
        line("Title", attrs.title),
        line("Type", attrs.work_item_type),
        line("Action", attrs.action),
      ]),
      url: firstString(attrs.url, projectUrl(event)),
      template: "orange",
    };
  },

  member: (event) => ({
    title: titleWithAction(event, "member", event.event_name),
    content: compactLines([
      line("Group", event.group_name),
      line("User", userName(event)),
      line("Event", event.event_name),
    ]),
    url: firstString(event.web_url, projectUrl(event)),
    template: "violet",
  }),

  project: (event) => ({
    title: titleWithAction(event, "project", event.event_name),
    content: compactLines([
      line("Project", firstString(event.path_with_namespace, event.name)),
      line("Event", event.event_name),
    ]),
    url: firstString(event.web_url, projectUrl(event)),
    template: "turquoise",
  }),

  subgroup: (event) => ({
    title: titleWithAction(event, "subgroup", event.event_name),
    content: compactLines([
      line("Group", event.group_name),
      line("Event", event.event_name),
    ]),
    url: firstString(event.web_url, projectUrl(event)),
    template: "violet",
  }),
};

formatters.job = formatters.build;
```

- [ ] **Step 5: Replace handler branching with registry dispatch**

Replace the current `if ("object_kind" in event && event.object_kind === "note")` branch with:

```ts
export const handleGitlabWebhook = async (
  event: WebhookEvents | GitlabWebhookPayload,
  robot: LarkRobot,
) => {
  const payload = asRecord(event);
  const kind = getGitlabEventKind(payload);
  const formatter = kind ? formatters[kind] : undefined;

  if (!kind || !formatter) {
    const result = {
      ignored: true,
      reason: "unsupported_event" as const,
      kind: kind ?? "unknown",
    };
    console.warn("Unsupported GitLab webhook event", {
      kind: result.kind,
      objectKind: payload.object_kind,
      eventType: payload.event_type,
    });
    return result;
  }

  const cardModel = formatter(payload, kind);
  return robot.send({
    msg_type: "interactive",
    card: makeInteractiveCard(cardModel),
  });
};
```

- [ ] **Step 6: Run the focused tests**

Run: `corepack pnpm vitest run src/__tests__/gitlab.spec.ts`

Expected: PASS with all tests in `src/__tests__/gitlab.spec.ts` green.

- [ ] **Step 7: Commit implementation**

```bash
git add src/gitlabHandler.ts src/__tests__/gitlab.spec.ts src/__tests__/__snapshots__/gitlab.spec.ts.snap
git commit -m "feat: support common gitlab webhook events"
```

## Task 3: Verify Full Project

**Files:**

- Read: `package.json`
- Verify: project tests and type checking

- [ ] **Step 1: Run the full test suite**

Run: `corepack pnpm test -- --run`

Expected: PASS for all Vitest suites.

- [ ] **Step 2: Run TypeScript checking**

Run: `corepack pnpm typeCheck`

Expected: PASS with no TypeScript diagnostics.

- [ ] **Step 3: Run formatter check**

Run: `corepack pnpm format`

Expected: PASS. If it reports formatting differences, run `corepack pnpm format:fix`, inspect the changed files with `git diff`, and commit only formatting changes caused by this task.

- [ ] **Step 4: Confirm final git state**

Run: `git status --short`

Expected: no uncommitted changes after the implementation and formatting commits.
