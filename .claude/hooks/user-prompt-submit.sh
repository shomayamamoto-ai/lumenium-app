#!/bin/bash
set -euo pipefail

input="$(cat)"
prompt="$(printf '%s' "$input" | jq -r '.prompt // empty')"

normalized="$(printf '%s' "$prompt" \
  | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
  | sed -E 's/[！!?？。、.,\.\,\ ]+$//')"

case "$normalized" in
  おはよう|おはよー|おはようございます|オハヨウ|オハヨー|オハヨウゴザイマス)
    jq -cn '{
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "ユーザーが朝の挨拶をしました。/ohayo コマンドと同等の朝のブリーフィングを作成してください。\n\n手順:\n1. Google Calendar MCP で今日（Asia/Tokyo）の予定を取得\n2. Gmail MCP で未読かつ重要な新着スレッド（過去1日）を検索\n3. Notion MCP で「今日」「today」「タスク」「todo」を検索\n\n出力フォーマット:\n- 見出し: ☀️ おはようございます — M月D日（曜日）\n- 📅 今日の予定（時刻つき）\n- 📬 重要メール（あれば）\n- 📝 タスク/メモ（あれば）\n\n情報がない項目は「なし」と明記。"
      }
    }'
    ;;
esac
