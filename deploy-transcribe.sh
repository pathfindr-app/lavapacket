#!/bin/bash
# Deploy Transcribe Function to Supabase
# Just double-click this file or run: ./deploy-transcribe.sh

cd "$(dirname "$0")"

echo "🔐 Logging into Supabase..."
npx supabase login

echo ""
echo "🔑 Setting OpenAI API key..."
echo "Enter your OpenAI API key:"
read -s OPENAI_KEY
npx supabase secrets set OPENAI_API_KEY="$OPENAI_KEY" --project-ref bdfmlnujqattlrbydbzr

echo ""
echo "🚀 Deploying transcribe function..."
npx supabase functions deploy transcribe --project-ref bdfmlnujqattlrbydbzr

echo ""
echo "✅ Done! Function URL:"
echo "https://bdfmlnujqattlrbydbzr.supabase.co/functions/v1/transcribe"
echo ""
read -p "Press Enter to close..."
