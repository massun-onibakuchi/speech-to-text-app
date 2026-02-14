#!/usr/bin/env bash
# where: .devcontainer/test_devcontainer_config.sh
# what: checks devcontainer.json gitconfig mount path
# why: enforce the expected host gitconfig location and prevent regressions

set -euo pipefail

config_file=".devcontainer/devcontainer.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required to validate ${config_file}" >&2
  exit 1
fi

# Validate JSON structure first to avoid false positives from invalid files.
jq empty "${config_file}" >/dev/null

expected_mount='source=${localEnv:HOME}/.config/git/config,target=/home/node/.gitconfig,type=bind,consistency=cached,readonly'
legacy_mount='source=${localEnv:HOME}/.gitconfig,target=/home/node/.gitconfig,type=bind,consistency=cached,readonly'

if jq -e --arg legacy_mount "${legacy_mount}" '
  (.mounts // [])
  | any(type == "string" and contains($legacy_mount))
' "${config_file}" >/dev/null; then
  echo "ERROR: legacy ~/.gitconfig bind mount detected in ${config_file}" >&2
  exit 1
fi

if ! jq -e --arg expected_mount "${expected_mount}" '
  (.mounts // [])
  | any(type == "string" and . == $expected_mount)
' "${config_file}" >/dev/null; then
  echo "ERROR: expected .config/git/config mount missing from ${config_file}" >&2
  exit 1
fi

echo "OK: ${config_file} uses the expected host .config/git/config mount"
