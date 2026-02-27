#!/usr/bin/env bash
# where: .devcontainer/test_worktrunk_post_install.sh
# what: validates worktrunk setup logic in post_install.py
# why: prevent regressions in default worktree path configuration

set -euo pipefail

post_install_file=".devcontainer/post_install.py"
expected_worktree_path='worktree-path = ".worktrees/{{ branch | sanitize }}"'

if [[ ! -f "${post_install_file}" ]]; then
  echo "ERROR: missing ${post_install_file}" >&2
  exit 1
fi

if ! rg -F "${expected_worktree_path}" "${post_install_file}" >/dev/null; then
  echo "ERROR: expected worktrunk worktree-path template is missing from ${post_install_file}" >&2
  exit 1
fi

if ! rg -F 'cargo install worktrunk' "${post_install_file}" >/dev/null; then
  echo "ERROR: expected cargo install command for worktrunk is missing from ${post_install_file}" >&2
  exit 1
fi

if ! rg -F 'git", "config", "--global", "worktree.useRelativePaths", "true"' "${post_install_file}" >/dev/null; then
  echo "ERROR: expected global git worktree.useRelativePaths configuration is missing from ${post_install_file}" >&2
  exit 1
fi

expected_aliases=(
  "alias ga='git add'"
  "alias gd='git diff'"
  "alias gs='git status'"
  "alias gp='git push'"
  "alias gl='git pull'"
  "alias gb='git branch'"
  "alias gco='git checkout'"
  "alias gsc='git switch -c'"
  "alias gci='git commit'"
)

for alias_line in "${expected_aliases[@]}"; do
  if ! rg -F "${alias_line}" "${post_install_file}" >/dev/null; then
    echo "ERROR: expected fish alias missing from ${post_install_file}: ${alias_line}" >&2
    exit 1
  fi
done

echo "OK: ${post_install_file} includes worktrunk install, worktree-path config, gitconfig defaults, and fish aliases"
