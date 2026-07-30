[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]+$')]
    [string]$MetaAppId,

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

function Assert-MetaAppSecret {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    if ($Value -notmatch '^[A-Fa-f0-9]{32}$') {
        throw "$Name must be the 32-character hexadecimal app secret from the Meta developer dashboard."
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

$metaSecretSecure = Read-Host 'Paste the new Meta App Secret' -AsSecureString
$instagramSecretSecure = Read-Host 'Paste the new Instagram App Secret' -AsSecureString
$metaAppSecret = $null
$instagramAppSecret = $null
$temporarySecretsFile = $null

try {
    $metaAppSecret = ConvertTo-PlainText -SecureValue $metaSecretSecure
    $instagramAppSecret = ConvertTo-PlainText -SecureValue $instagramSecretSecure
    Assert-MetaAppSecret -Name 'Meta App Secret' -Value $metaAppSecret
    Assert-MetaAppSecret -Name 'Instagram App Secret' -Value $instagramAppSecret

    Write-Host "Updating Vercel $VercelEnvironment provider variables..."
    Set-VercelVariable -Name 'NEXT_PUBLIC_META_APP_ID' -Value $MetaAppId -Sensitive $false
    Set-VercelVariable -Name 'META_APP_SECRET' -Value $metaAppSecret -Sensitive $true
    Set-VercelVariable -Name 'INSTAGRAM_APP_ID' -Value $InstagramAppId -Sensitive $false
    Set-VercelVariable -Name 'INSTAGRAM_APP_SECRET' -Value $instagramAppSecret -Sensitive $true

    $temporarySecretsFile = Join-Path ([IO.Path]::GetTempPath()) ("swiftflow-provider-{0}.env" -f [Guid]::NewGuid().ToString('N'))
    $secretLines = @(
        "META_APP_ID=$MetaAppId",
        "META_APP_SECRET=$metaAppSecret",
        "INSTAGRAM_APP_ID=$InstagramAppId",
        "INSTAGRAM_APP_SECRET=$instagramAppSecret"
    )
    [IO.File]::WriteAllLines(
        $temporarySecretsFile,
        $secretLines,
        [Text.UTF8Encoding]::new($false)
    )

    Write-Host 'Updating Supabase Edge Function provider secrets...'
    & supabase secrets set --project-ref $SupabaseProjectRef --env-file $temporarySecretsFile
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to update Supabase Edge Function provider secrets.'
    }

    Write-Host 'Removing confirmed legacy Vercel variables...'
    foreach ($legacyName in @('FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET')) {
        & vercel env rm $legacyName --yes
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "$legacyName was not removed; it may already be absent."
        }
    }

    Write-Host 'Provider credentials updated successfully.' -ForegroundColor Green
    Write-Host 'Next: redeploy Vercel and the affected Supabase functions, then reconnect Instagram.'
}
finally {
    if ($temporarySecretsFile -and (Test-Path -LiteralPath $temporarySecretsFile)) {
        Remove-Item -LiteralPath $temporarySecretsFile -Force
    }
    if ($metaSecretSecure) { $metaSecretSecure.Dispose() }
    if ($instagramSecretSecure) { $instagramSecretSecure.Dispose() }
    $metaAppSecret = $null
    $instagramAppSecret = $null
    Remove-Variable metaAppSecret, instagramAppSecret -ErrorAction SilentlyContinue
}
