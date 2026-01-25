# Supabase Edge Functions Setup

## Prerequisites
1. Install Supabase CLI: `brew install supabase/tap/supabase`
2. Login: `supabase login`

## Deploy Transcribe Function

### 1. Set your OpenAI API key as a secret
```bash
supabase secrets set OPENAI_API_KEY=sk-proj-your-key-here --project-ref bdfmlnujqattlrbydbzr
```

### 2. Deploy the function
```bash
cd /Users/bradleyarakaki/Desktop/LavaRoofing/EstimatePacket
supabase functions deploy transcribe --project-ref bdfmlnujqattlrbydbzr
```

### 3. Test the function
```bash
curl -X POST 'https://bdfmlnujqattlrbydbzr.supabase.co/functions/v1/transcribe' \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@test-audio.webm'
```

## Function URL
Once deployed, the function will be available at:
```
https://bdfmlnujqattlrbydbzr.supabase.co/functions/v1/transcribe
```

## Enable in Frontend
Update `js/config.local.js`:
```javascript
window.TRANSCRIBE_FUNCTION_URL = 'https://bdfmlnujqattlrbydbzr.supabase.co/functions/v1/transcribe';
```

The frontend will automatically use the Edge Function instead of direct API calls.
