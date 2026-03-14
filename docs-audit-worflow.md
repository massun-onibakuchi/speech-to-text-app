Workflow

This workflow uses a Telegram topic as a task thread for an agent.

First, the system creates a new topic for the task.
That topic becomes the dedicated place where all task-related messages are posted.

Next, the system sends a context-setting command such as /ctx set $TAKOPI_PJ in that newly created topic.
This tells the agent which project or workspace it should use.

After that, the system sends a prompt with the actual task instruction in the same topic.
The prompt should instruct the agent to work autonomously: sync the latest base branch, switch to a fresh worktree, inspect and update the docs, validate the changes, create a PR, and continue until the PR is completed without waiting for user guidance during normal flow.

The server-side agent reads the messages in that topic, performs the requested work, and posts the result back to the same topic.

In short, the workflow is:

create a topic → send /ctx in that topic → send task prompt in the same topic → agent processes the task → post the result in the same topic

For this report, the description stays at the workflow level and does not include API-level details.
