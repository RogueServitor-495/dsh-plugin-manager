#!/usr/bin/env bash
# Prepare the dev DSH home (dsh-home/) for this plugin: copy user data from
# the real ~/.dsh, symlink the shared module store, register this plugin.
# Run once before the first start.sh. Safe to re-run.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
USER_HOME="${HOME:-$(echo ~)}"
HOME_DIR="$HERE/dsh-home"
PROFILE_DIR="$HOME_DIR/profiles/web"

mkdir -p "$HOME_DIR" "$PROFILE_DIR"
for f in .anonymous-user-id .credentials.yaml settings.yaml; do
  [ -f "$HOME_DIR/$f" ] || [ ! -f "$USER_HOME/.dsh/$f" ] || cp "$USER_HOME/.dsh/$f" "$HOME_DIR/$f"
done
[ -d "$HOME_DIR/sessions" ] || [ ! -d "$USER_HOME/.dsh/sessions" ] || cp -R "$USER_HOME/.dsh/sessions" "$HOME_DIR/sessions"
[ -d "$HOME_DIR/storages" ] || [ ! -d "$USER_HOME/.dsh/storages" ] || cp -R "$USER_HOME/.dsh/storages" "$HOME_DIR/storages"

# shared hoisted store: workspace-local copy (never touches ~/.dsh)
mkdir -p "$HOME_DIR/profiles"
node "$HERE/dev/materialize-store.mjs"

# profile scaffold
[ -f "$PROFILE_DIR/cordis.yml" ] || cat > "$PROFILE_DIR/cordis.yml" <<'EOF'
[]
EOF
[ -f "$PROFILE_DIR/package.json" ] || cat > "$PROFILE_DIR/package.json" <<'EOF'
{
  "name": "dsh-profile-web-dev",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ]
    }
  }
}
EOF

# link this plugin into the profile node_modules
mkdir -p "$PROFILE_DIR/node_modules"
[ -e "$PROFILE_DIR/node_modules/dsh-plugin-manager" ] || ln -s "$HERE" "$PROFILE_DIR/node_modules/dsh-plugin-manager"

# register the plugin row (id must equal the bundle module id)
PATCH="$PROFILE_DIR/cordis.patch.yml"
if [ -f "$PATCH" ] && grep -q "id: dsh-plugin-manager" "$PATCH"; then
  echo "already registered"
else
  cat >> "$PATCH" <<'EOF'

- insert:
    - id: dsh-plugin-manager
      name: 'dsh-plugin-manager'
EOF
  echo "registered"
fi
echo "dev home ready at $HOME_DIR"
