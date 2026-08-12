[CmdletBinding()]
param(
    [string]$Repo,
    [switch]$SkipDependencies,
    [switch]$SkipSkillInstall
)

$ErrorActionPreference = 'Stop'
$scriptPath = $MyInvocation.MyCommand.Path
if (-not $Repo) {
    if (-not $scriptPath) { throw "The script path could not be resolved. Pass -Repo explicitly." }
    $Repo = Split-Path -Parent (Split-Path -Parent $scriptPath)
}
$repoPath = (Resolve-Path -LiteralPath $Repo).Path

if (-not (Test-Path -LiteralPath (Join-Path $repoPath 'src\imported-terms.json'))) {
    throw "Not a UE Words repository: $repoPath"
}

if (-not (Test-Path -LiteralPath (Join-Path $repoPath '.git'))) {
    throw "Git metadata was not found. Clone the repository instead of copying only its files."
}

Write-Host "UE Words repository: $repoPath"

if (-not $SkipDependencies) {
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        $corepack = Get-Command corepack -ErrorAction SilentlyContinue
        if (-not $corepack) {
            throw "pnpm and Corepack were not found. Install Node.js 22+, reopen PowerShell, then run this script again."
        }
        & $corepack.Source enable
        if ($LASTEXITCODE -ne 0) { throw "Corepack could not enable pnpm (exit code $LASTEXITCODE)" }
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
        if (-not $pnpm) { throw "Corepack completed, but pnpm is still unavailable. Reopen PowerShell and run this script again." }
    }

    Push-Location $repoPath
    try {
        & $pnpm.Source install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE" }

        & $pnpm.Source run check
        if ($LASTEXITCODE -ne 0) { throw "pnpm run check failed with exit code $LASTEXITCODE" }

        & $pnpm.Source run build
        if ($LASTEXITCODE -ne 0) { throw "pnpm run build failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

if (-not $SkipSkillInstall) {
    $skillsRoot = Join-Path $HOME '.codex\skills'
    New-Item -ItemType Directory -Path $skillsRoot -Force | Out-Null

    foreach ($skillName in @('collect-terms', 'prepare-term-submission')) {
        $source = Join-Path $repoPath "codex-skills\$skillName"
        $target = Join-Path $skillsRoot $skillName
        if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md'))) {
            throw "Skill source was not found: $source"
        }

        $staging = Join-Path $skillsRoot "$skillName.installing"
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
        Copy-Item -LiteralPath $source -Destination $staging -Recurse -Force

        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Recurse -Force
        }
        Move-Item -LiteralPath $staging -Destination $target
        Write-Host "Installed Skill: $target"
    }
}

Write-Host "Setup complete. Restart Codex and open this repository as the project."
