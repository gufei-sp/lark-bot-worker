# GitLab Webhook Event Support Design

## Context

The worker currently accepts GitLab webhook JSON, formats only `note` events into a Lark/Feishu interactive card, and logs every other event as unknown. The goal is to support more GitLab webhook event types and make unsupported events non-fatal: they should be logged and ignored without throwing.

GitLab's webhook event list includes project and group events such as push, tag push, merge request, note, issue, pipeline, job, deployment, wiki page, release, emoji, feature flag, milestone, vulnerability, work item, group member, project, and subgroup events.

## Architecture

Keep the public entrypoint unchanged:

- `src/worker.ts` parses the request body and calls `handleGitlabWebhook(event, robot)`.
- `handleGitlabWebhook` identifies the GitLab event kind, formats supported events into one Lark interactive card, and sends it through `robot.send`.
- Unsupported events are logged with `console.warn` and return an ignored result instead of throwing.

Inside `src/gitlabHandler.ts`, introduce a small formatter registry:

- `getGitlabEventKind(event)` reads `object_kind` first and falls back to `event_type`.
- `formatGitlabEvent(event)` looks up a formatter by normalized event kind.
- Each formatter returns a common card model: title, content lines, optional URL, and optional Lark header template.
- The existing `makeInteractiveCard` remains the Lark card renderer.

The registry can live in `gitlabHandler.ts` for this change. If formatter logic grows substantially later, move it into `src/gitlab/formatters.ts` without changing `handleGitlabWebhook`'s behavior.

## Event Coverage

Add concise Lark card support for these event kinds:

- `push`
- `tag_push`
- `merge_request`
- `note`
- `issue`
- `pipeline`
- `build` and `job`
- `deployment`
- `wiki_page`
- `release`
- `emoji`
- `feature_flag`
- `milestone`
- `vulnerability`
- `work_item`
- `member`
- `project`
- `subgroup`

Formatters should favor stable, commonly present fields and use defensive fallbacks when payloads differ by GitLab version or project/group webhook type. Cards should include the project or group name when available, key status/action fields, branch/ref names, title/message fields, author/user names, and a URL when the payload exposes one.

## Data Flow

1. Worker receives a webhook request and parses JSON.
2. Handler normalizes the event kind from `object_kind` or `event_type`.
3. Handler selects a formatter from the registry.
4. Supported event formatter returns the card model.
5. Handler renders the model with `makeInteractiveCard`.
6. Handler sends the interactive card to Lark.
7. Unsupported or unidentifiable events are logged and return an ignored result without calling Lark.

## Error Handling

Unsupported GitLab event payloads must not throw. They should log a warning containing the normalized kind, raw `object_kind`, and raw `event_type`.

Malformed payloads that do not have recognizable GitLab webhook fields should also be ignored with a warning. This keeps the Cloudflare Worker from returning a 500 for newly added GitLab event types or unusual group webhook payloads.

Errors from `robot.send` should continue to propagate. Those are delivery failures, not unsupported-event cases, and callers should be able to observe them.

## Testing

Use Vitest tests around `handleGitlabWebhook` and card output:

- Existing `note` snapshot continues to pass.
- Representative supported events call `robot.send` exactly once with an interactive card.
- Unsupported events call `console.warn`, do not call `robot.send`, and return an ignored result.
- Payloads using only `event_type` still route to the expected formatter.

Tests can use compact hand-written fixtures for non-note events. Full GitLab sample payloads are not required for every formatter because the formatter design is defensive and only reads a small set of stable fields.
