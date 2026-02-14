#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = ["requests", "markdown-it-py", "sulguk>=0.11.1"]
# ///
import json
import re
import sys
import traceback
import tomllib
from datetime import datetime, timezone
from pathlib import Path

import requests
from markdown_it import MarkdownIt
from sulguk import transform_html

CREDS_PATH = Path.home() / ".codex" / "telegram.toml"
ERR_PATH = Path.home() / ".codex" / "telegram_last_error.txt"
LOG_PATH = Path.home() / ".codex" / "telegram_notify.log"

_MD_RENDERER = MarkdownIt("commonmark", {"html": False})
_BULLET_RE = re.compile(r"(?m)^(\s*)•")
_LIST_PARA_RE = re.compile(r"(?s)<li([^>]*)>\s*<p>(.*?)</p>\s*</li>")


def _tighten_list_paragraphs(html: str) -> str:
    return _LIST_PARA_RE.sub(r"<li\1>\2</li>", html)


def _log(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(f"{ts} {message}\n")


def main() -> None:
    _log(f"start argv_len={len(sys.argv)}")
    creds = tomllib.loads(CREDS_PATH.read_text(encoding="utf-8"))
    bot_token = creds["bot_token"]
    chat_id = creds["chat_id"]

    if len(sys.argv) < 2:
        raise ValueError("missing event argument")
    event = json.loads(sys.argv[1])

    md = event["last-assistant-message"].rstrip()
    thread_id = event.get("thread-id")
    if thread_id:
        md += f"\n\n`codex resume {thread_id}`"

    html = _MD_RENDERER.render(md)
    html = _tighten_list_paragraphs(html)
    rendered = transform_html(html)

    text = _BULLET_RE.sub(r"\1-", rendered.text)
    entities = [dict(e) for e in rendered.entities]

    r = requests.post(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        json={
            "chat_id": chat_id,
            "text": text,
            "entities": entities,
            "disable_web_page_preview": True,
        },
        timeout=15,
    )

    try:
        data = r.json()
    except Exception:
        data = {"ok": False, "description": r.text}

    if not (r.status_code == 200 and data.get("ok") is True):
        err = f"{r.status_code}\n{data.get('description', '')}\n"
        ERR_PATH.write_text(err, encoding="utf-8")
        _log(f"send failed status={r.status_code} desc={data.get('description', '')}")
    else:
        _log("send ok")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        ERR_PATH.write_text(f"exception\n{type(e).__name__}: {e}\n", encoding="utf-8")
        _log(f"exception {type(e).__name__}: {e}")
        _log(traceback.format_exc().rstrip())
