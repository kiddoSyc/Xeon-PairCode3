#!/bin/bash
echo "🔍 Cleaning up git locks..."
find .git -name "*.lock" -type f -delete

echo "📂 Adding all changes..."
git add .

# Generate a timestamp
TIME=$(date +"%Y-%m-%d %H:%M:%S")

echo "📝 Committing changes..."
git commit -m "Auto update from Termux @ $TIME" || echo "⚡ No new changes to commit"

echo "🚀 Pushing to GitHub..."
git push origin main
