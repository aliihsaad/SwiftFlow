[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]+$')]
    [string]$SupabaseProjectRef,

    [string]$EnvFile = '.env.local',

    [ValidateSet('production', 'preview', 'development')]
    [string]$VercelEnvironment = 'production'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not available. Install it and log in first."
    }
}

function Read-DotEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Environment file '$Path' was not found. Copy .env.vercel.example to .env.local and fill it first."
    }

    $values = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }

        $separator = $line.IndexOf('=')
        if ($separator -lt 1) { continue }

        $name = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($value.Length -ge 2) {
            $first = $value[0]
            $last = $value[$value.Length - 1]
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        $values[$name] = $value
    }
    return $values
}

function Assert-ConfiguredValue {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Values,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Values.ContainsKey($Name) -or -not [string]$Values[$Name]) {
        throw "Missing $Name in the environment file."
    }

    $value = [string]$Values[$Name]
    if ($value -match 'your-|xxxxx|replace-with') {
        throw "$Name still contains a template placeholder."
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

$resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
$environment = Read-DotEnvFile -Path $resolvedEnvFile

$serviceKeyName = if ($environment.ContainsKey('SUPABASE_SERVICE_ROLE_KEY')) {
    'SUPABASE_SERVICE_ROLE_KEY'
} else {
    'SUPABASE_SERVICE_KEY'
}

$required = @(
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    $serviceKeyName,
    'NEXT_PUBLIC_APP_URL',
    'RESEND_API_KEY',
    'INVITE_EMAIL_FROM',
    'APP_SECRETS_ENCRYPTION_KEY',
    'INSTAGRAM_APP_ID',
    'INSTAGRAM_APP_SECRET',
    'META_WEBHOOK_VERIFY_TOKEN'
)

foreach ($name in $required) {
    Assert-ConfiguredValue -Values $environment -Name $name
}

if (([string]$environment['APP_SECRETS_ENCRYPTION_KEY']).Length -lt 32) {
    throw 'APP_SECRETS_ENCRYPTION_KEY must contain at least 32 characters of random material.'
}
if (([string]$environment['META_WEBHOOK_VERIFY_TOKEN']).Length -lt 32) {
    throw 'META_WEBHOOK_VERIFY_TOKEN must contain at least 32 characters of random material.'
}

$environment['APP_SECRETS_ENCRYPTION_VERSION'] = if ($environment['APP_SECRETS_ENCRYPTION_VERSION']) {
    $environment['APP_SECRETS_ENCRYPTION_VERSION']
} else { 'v1' }
$environment['APP_RELEASE_CHANNEL'] = if ($environment['APP_RELEASE_CHANNEL']) {
    $environment['APP_RELEASE_CHANNEL']
} else { 'production_full' }
$environment['INSTAGRAM_OAUTH_EXTRA_SCOPES'] = if ($environment['INSTAGRAM_OAUTH_EXTRA_SCOPES']) {
    $environment['INSTAGRAM_OAUTH_EXTRA_SCOPES']
} else { 'instagram_business_manage_messages' }

$vercelVariables = [ordered]@{
    NEXT_PUBLIC_SUPABASE_URL = $environment['NEXT_PUBLIC_SUPABASE_URL']
    NEXT_PUBLIC_SUPABASE_ANON_KEY = $environment['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    SUPABASE_SERVICE_KEY = $environment[$serviceKeyName]
    NEXT_PUBLIC_APP_URL = $environment['NEXT_PUBLIC_APP_URL']
    RESEND_API_KEY = $environment['RESEND_API_KEY']
    INVITE_EMAIL_FROM = $environment['INVITE_EMAIL_FROM']
    APP_SECRETS_ENCRYPTION_KEY = $environment['APP_SECRETS_ENCRYPTION_KEY']
    APP_SECRETS_ENCRYPTION_VERSION = $environment['APP_SECRETS_ENCRYPTION_VERSION']
    INSTAGRAM_APP_ID = $environment['INSTAGRAM_APP_ID']
    INSTAGRAM_APP_SECRET = $environment['INSTAGRAM_APP_SECRET']
    INSTAGRAM_OAUTH_EXTRA_SCOPES = $environment['INSTAGRAM_OAUTH_EXTRA_SCOPES']
    META_WEBHOOK_VERIFY_TOKEN = $environment['META_WEBHOOK_VERIFY_TOKEN']
    APP_RELEASE_CHANNEL = $environment['APP_RELEASE_CHANNEL']
}

foreach ($optionalName in @(
    'APP_SECRETS_ENCRYPTION_KEY_PREVIOUS',
    'DEVELOPER_API_KEY_PEPPER',
    'DEVELOPER_API_KEY_PEPPER_PREVIOUS',
    'INVITE_EMAIL_REPLY_TO',
    'GEMINI_API_KEY'
)) {
    if ($environment.ContainsKey($optionalName) -and [string]$environment[$optionalName]) {
        $vercelVariables[$optionalName] = $environment[$optionalName]
    }
}

$sensitiveNames = @(
    'SUPABASE_SERVICE_KEY',
    'APP_SECRETS_ENCRYPTION_KEY',
    'APP_SECRETS_ENCRYPTION_KEY_PREVIOUS',
    'DEVELOPER_API_KEY_PEPPER',
    'DEVELOPER_API_KEY_PEPPER_PREVIOUS',
    'INSTAGRAM_APP_SECRET',
    'META_WEBHOOK_VERIFY_TOKEN',
    'RESEND_API_KEY',
    'GEMINI_API_KEY'
)

$temporarySecretsFile = $null
$configured = $false
try {
    Write-Host "Updating Vercel $VercelEnvironment environment variables..."
    foreach ($entry in $vercelVariables.GetEnumerator()) {
        Set-VercelVariable `
            -Name $entry.Key `
            -Value ([string]$entry.Value) `
            -Sensitive ($sensitiveNames -contains $entry.Key)
    }

    $temporarySecretsFile = Join-Path ([IO.Path]::GetTempPath()) ("swiftflow-supabase-{0}.env" -f [Guid]::NewGuid().ToString('N'))
    $supabaseSecretLines = @(
        "APP_SECRETS_ENCRYPTION_KEY=$($environment['APP_SECRETS_ENCRYPTION_KEY'])",
        "APP_SECRETS_ENCRYPTION_VERSION=$($environment['APP_SECRETS_ENCRYPTION_VERSION'])",
        "INSTAGRAM_APP_ID=$($environment['INSTAGRAM_APP_ID'])",
        "INSTAGRAM_APP_SECRET=$($environment['INSTAGRAM_APP_SECRET'])",
        "META_WEBHOOK_VERIFY_TOKEN=$($environment['META_WEBHOOK_VERIFY_TOKEN'])"
    )
    if ($environment.ContainsKey('APP_SECRETS_ENCRYPTION_KEY_PREVIOUS') -and [string]$environment['APP_SECRETS_ENCRYPTION_KEY_PREVIOUS']) {
        $supabaseSecretLines += "APP_SECRETS_ENCRYPTION_KEY_PREVIOUS=$($environment['APP_SECRETS_ENCRYPTION_KEY_PREVIOUS'])"
    }
    if ($environment.ContainsKey('GEMINI_API_KEY') -and [string]$environment['GEMINI_API_KEY']) {
        $supabaseSecretLines += "GEMINI_API_KEY=$($environment['GEMINI_API_KEY'])"
    }
    [IO.File]::WriteAllLines($temporarySecretsFile, $supabaseSecretLines, [Text.UTF8Encoding]::new($false))

    Write-Host 'Updating Supabase Edge Function secrets...'
    & supabase secrets set --project-ref $SupabaseProjectRef --env-file $temporarySecretsFile
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to update Supabase Edge Function secrets. Confirm that the CLI is logged in to the project owner account.'
    }

    $configured = $true
}
finally {
    if ($temporarySecretsFile -and (Test-Path -LiteralPath $temporarySecretsFile)) {
        Remove-Item -LiteralPath $temporarySecretsFile -Force
    }
}

if ($configured) {
    Write-Host 'Managed deployment variables configured successfully.' -ForegroundColor Green
    Write-Host 'No secret values were printed. The temporary Supabase file was removed.'
}
