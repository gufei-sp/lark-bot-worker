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
  if (message.msg_type !== "interactive") {
    throw new Error(`Expected interactive message, got ${message.msg_type}`);
  }
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
