# notify telegram

send codex completion summaries to telegram with safe markdown rendering.

## install

copy the script to `~/.codex/notify_telegram.py`.

create your [telegram creds](https://t.me/botfather) file at `~/.codex/telegram.toml`:

```toml
bot_token = "123456:ABCDEF..."
chat_id = 462722
```

## config

recommended: use a tiny wrapper so notify runs detached from codex process lifetime.

create `~/.codex/notify_telegram_wrapper.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
nohup /usr/bin/uv run -q "$HOME/.codex/notify_telegram.py" "$@" >> "$HOME/.codex/telegram_notify_wrapper.log" 2>&1 &
```

make it executable:

```bash
chmod +x ~/.codex/notify_telegram_wrapper.sh
```

then add `notify` to `~/.codex/config.toml`:

```toml
notify = ["/home/<your-user>/.codex/notify_telegram_wrapper.sh"]
```

## notes

- reads `last-assistant-message` and treats it as markdown
- renders markdown to html, converts to telegram text/entities via `sulguk`, then posts with `requests`
- normalizes list bullets from `•` to `-` for consistent telegram output
- logs invocations to `~/.codex/telegram_notify.log`
- writes failures to `~/.codex/telegram_last_error.txt`
