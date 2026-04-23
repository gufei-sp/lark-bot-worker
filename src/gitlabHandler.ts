import type { LarkRobot } from "./lark/robot";
import type { WebhookEvents } from "gitlab-event-types";

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

/**
 * See https://open.feishu.cn/tool/cardbuilder?from=howtoguide
 */
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
  /**
   * Custom bot only supports `@users` using open_id;
   */
  at?: string[];
  atAll?: boolean;
  template?: LarkCardTemplate;
}) =>
  ({
    config: {
      wide_screen_mode: true,
    },

    header: {
      template,
      title: {
        tag: "plain_text",
        content: title,
      },
    },

    elements: [
      {
        tag: "markdown",
        content,
      },

      at && {
        tag: "div",
        text: {
          content: at.map((email) => `<at email=${email}></at>`).join(" "),
          tag: "lark_md",
        },
      },

      atAll && {
        tag: "div",
        text: {
          content: "<at id=all></at>",
          tag: "lark_md",
        },
      },

      url && {
        actions: [
          {
            tag: "button",
            text: {
              content: "立即查看",
              tag: "plain_text",
            },
            type: "primary",
            url,
          },
        ],
        tag: "action",
      },
    ].filter(Boolean),
  }) as const;

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
) =>
  compactLines([projectName(event), label, stringValue(action)]).replace(
    /\n/g,
    " ",
  );

const normalizeGitlabEventKind = (kind: unknown) =>
  stringValue(kind)?.trim().toLowerCase().replace(/\s+/g, "_");

const getGitlabEventKind = (event: GitlabWebhookPayload) =>
  normalizeGitlabEventKind(event.object_kind) ??
  normalizeGitlabEventKind(event.event_type);

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
    const sourceBranch = firstString(attrs.source_branch);
    const targetBranch = firstString(attrs.target_branch);

    return {
      title: titleWithAction(event, "merge request", attrs.action),
      content: compactLines([
        line("Title", attrs.title),
        line("Author", userName(event)),
        line(
          "Branches",
          sourceBranch && targetBranch
            ? `${sourceBranch} -> ${targetBranch}`
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
    const action = firstString(event.action, attrs.action);

    return {
      title: titleWithAction(event, "release", action),
      content: compactLines([
        line("Release", firstString(event.name, attrs.name, attrs.tag)),
        line("Action", action),
      ]),
      url: firstString(event.url, attrs.url, projectUrl(event)),
      template: "green",
    };
  },

  emoji: (event) => {
    const attrs = objectAttributes(event);
    const action = firstString(attrs.action, event.event_type);

    return {
      title: titleWithAction(event, "emoji", action),
      content: compactLines([
        line("Emoji", attrs.name),
        line("User", userName(event)),
        line("Action", action),
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
      template:
        attrs.severity === "critical" || attrs.severity === "high"
          ? "red"
          : "orange",
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
