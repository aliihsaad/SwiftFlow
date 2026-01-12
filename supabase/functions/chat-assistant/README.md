# Chat Assistant Edge Function

This edge function handles AI chat interactions using Google's Gemini API.

## Deployment

1. **Set the Gemini API Key as a secret:**
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
```

2. **Deploy the function:**
```bash
supabase functions deploy chat-assistant
```

## Testing Locally

```bash
supabase functions serve chat-assistant --env-file .env.local
```

## API Usage

**Endpoint:** `https://[project-ref].supabase.co/functions/v1/chat-assistant`

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Write a caption for a fitness post" },
    { "role": "assistant", "content": "Here's a caption..." },
    { "role": "user", "content": "Make it funnier" }
  ]
}
```

**Response:**
```json
{
  "response": "AI generated response here..."
}
```

**Error Response:**
```json
{
  "error": "Error message"
}
```
