// Supabase Edge Function: Transcribe audio using OpenAI Whisper
// Deploy: supabase functions deploy transcribe --project-ref bdfmlnujqattlrbydbzr

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // Get the audio file from the request
    const formData = await req.formData()
    const audioFile = formData.get('file') as File

    if (!audioFile) {
      throw new Error('No audio file provided')
    }

    console.log(`Transcribing: ${audioFile.name}, size: ${audioFile.size}, type: ${audioFile.type}`)

    // Optional parameters
    const language = formData.get('language') as string || undefined
    const prompt = formData.get('prompt') as string || undefined

    // Create form data for OpenAI
    const openaiFormData = new FormData()
    openaiFormData.append('file', audioFile, audioFile.name || 'audio.webm')
    openaiFormData.append('model', 'whisper-1')
    openaiFormData.append('response_format', 'json')

    if (language) {
      openaiFormData.append('language', language)
    }
    if (prompt) {
      openaiFormData.append('prompt', prompt)
    }

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: openaiFormData,
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('OpenAI error:', error)
      throw new Error(error.error?.message || 'Transcription failed')
    }

    const result = await response.json()
    console.log(`Transcription complete: ${result.text?.substring(0, 50)}...`)

    return new Response(
      JSON.stringify({
        text: result.text,
        success: true
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Transcription error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})
