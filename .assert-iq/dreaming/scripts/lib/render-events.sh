#!/usr/bin/env bash
# Shared helper: render session-events.template.json with __PACK_ROOT__
# substituted for an absolute path. Sourced by install.sh and bootstrap.sh so
# the substitution logic stays in one place.

sed_escape_replacement() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//&/\\&}
  s=${s//|/\\|}
  printf '%s' "$s"
}

# render_events_template <template> <out> <pack_root>
render_events_template() {
  local template="$1" out="$2" pack_root="$3"
  [[ -f "$template" ]] || return 1
  local escaped
  escaped="$(sed_escape_replacement "$pack_root")"
  sed "s|__PACK_ROOT__|$escaped|g" "$template" > "$out"
}
