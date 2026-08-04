[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+$')]
    [string]$InstagramAppId,

    [ValidatePattern('^[a-z0-9]+$')]
    [string]$SupabaseProjectRef = 'txomrdymcawauezlprvn',

    [ValidateSet('production', 'preview', 'development')]
    [string]$VercelEnvironment = 'production'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not available."
    }
}

function ConvertTo-PlainText {
    param([Parameter(Mandatory = $true)][Security.SecureString]$SecureValue)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Assert-InstagramAppSecret {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value -notmatch '^[A-Fa-f0-9]{32}$') {
        throw 'Instagram App Secret must be the 32-character hexadecimal secret from the Instagram API setup panel.'
    }
}

function Set-VercelVariable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][bool]$Sensitive
    )

    $arguments = @('env', 'add', $Name, $VercelEnvironment, '--force', '--yes')
    $arguments += if ($Sensitive) { '--sensitive' } else { '--no-sensitive' }
    $Value | & vercel @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set Vercel variable $Name for $VercelEnvironment."
    }
}

Assert-CommandAvailable -Name 'vercel'
Assert-CommandAvailable -Name 'supabase'

$instagramSecretSecure = Read-Host 'Paste the Instagram App Secret' -AsSecureString
$instagramAppSecret = $null
$temporarySecretsFile = $null

try {
    $instagramAppSecret = ConvertTo-PlainText -SecureValue $instagramSecretSecure
    Assert-InstagramAppSecret -Value $instagramAppSecret

    Write-Host "Updating Vercel $VercelEnvironment Instagram variables..."
    Set-VercelVariable -Name 'INSTAGRAM_APP_ID' -Value $InstagramAppId -Sensitive $false
    Set-VercelVariable -Name 'INSTAGRAM_APP_SECRET' -Value $instagramAppSecret -Sensitive $true

    $temporarySecretsFile = Join-Path ([IO.Path]::GetTempPath()) ("swiftflow-provider-{0}.env" -f [Guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllLines(
        $temporarySecretsFile,
        @(
            "INSTAGRAM_APP_ID=$InstagramAppId",
            "INSTAGRAM_APP_SECRET=$instagramAppSecret"
        ),
        [Text.UTF8Encoding]::new($false)
    )

    Write-Host 'Updating Supabase Edge Function Instagram secrets...'
    & supabase secrets set --project-ref $SupabaseProjectRef --env-file $temporarySecretsFile
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to update Supabase Edge Function Instagram secrets.'
    }

    Write-Host 'Removing obsolete Vercel provider variables...'
    foreach ($legacyName in @('NEXT_PUBLIC_META_APP_ID', 'META_APP_SECRET', 'FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET')) {
        & vercel env rm $legacyName --yes
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "$legacyName was not removed; it may already be absent."
        }
    }

    Write-Host 'Removing obsolete Supabase provider secrets...'
    & supabase secrets unset META_APP_ID META_APP_SECRET --project-ref $SupabaseProjectRef
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Legacy Supabase provider secrets were not removed; they may already be absent.'
    }

    Write-Host 'Instagram provider credentials updated successfully.' -ForegroundColor Green
    Write-Host 'Next: redeploy Vercel and the affected Supabase functions, then reconnect Instagram.'
}
finally {
    if ($temporarySecretsFile -and (Test-Path -LiteralPath $temporarySecretsFile)) {
        Remove-Item -LiteralPath $temporarySecretsFile -Force
    }
    if ($instagramSecretSecure) { $instagramSecretSecure.Dispose() }
    $instagramAppSecret = $null
    Remove-Variable instagramAppSecret -ErrorAction SilentlyContinue
}
