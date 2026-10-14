#!/bin/sh
# Packages src/ into an installable Alfred workflow.
set -e
cd "$(dirname "$0")"
plutil -lint src/info.plist
mkdir -p dist
rm -f dist/JWT-Viewer.alfredworkflow
(cd src && zip -q -r ../dist/JWT-Viewer.alfredworkflow .)
echo "Built dist/JWT-Viewer.alfredworkflow"
