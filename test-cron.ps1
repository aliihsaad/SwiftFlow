# Test the Edge Function manually
# Replace YOUR_SERVICE_ROLE_KEY with your actual key

$headers = @{
    "Authorization" = "Bearer YOUR_SERVICE_ROLE_KEY_HERE"
    "Content-Type" = "application/json"
}

$response = Invoke-WebRequest -Uri "https://txomrdymcawauezlprvn.supabase.co/functions/v1/process-scheduled-posts" -Method POST -Headers $headers -Body "{}"

Write-Host "Status: $($response.StatusCode)"
Write-Host "Response: $($response.Content)"
