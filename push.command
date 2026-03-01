#!/bin/zsh
cd /Users/kevinwhite/sites/spirit-media-publishing
git add -A
git commit -m "site update"
git push
echo ""
echo "✅ Done! Your site is live in about 60 seconds."
echo ""
read -k "?Press any key to close..."
