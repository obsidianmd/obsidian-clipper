param(
	[Parameter(Mandatory = $true)]
	[string]$ExtensionId,

	[ValidateSet('Chrome', 'Edge')]
	[string]$Browser = 'Chrome'
)

$ErrorActionPreference = 'Stop'

$hostName = 'com.obsidian_clipper.codex'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherSource = Join-Path $scriptDir 'obsidian-clipper-codex-host-launcher.cs'
$hostPath = Join-Path $scriptDir 'obsidian-clipper-codex-host.exe'
$manifestPath = Join-Path $scriptDir "$hostName.$($Browser.ToLowerInvariant()).json"

if (-not (Test-Path $hostPath) -or (Get-Item $hostPath).LastWriteTimeUtc -lt (Get-Item $launcherSource).LastWriteTimeUtc) {
	$csc = Get-Command csc.exe -ErrorAction SilentlyContinue
	if (-not $csc) {
		$csc = Get-ChildItem -Path "$env:WINDIR\Microsoft.NET\Framework64", "$env:WINDIR\Microsoft.NET\Framework" -Recurse -Filter csc.exe -ErrorAction SilentlyContinue |
			Sort-Object FullName -Descending |
			Select-Object -First 1
	}

	if (-not $csc) {
		throw 'Could not find csc.exe. Install the .NET SDK or .NET Framework developer tools, then rerun this script.'
	}

	$cscPath = if ($csc.Source) { $csc.Source } else { $csc.FullName }
	& $cscPath /nologo /target:exe "/out:$hostPath" $launcherSource
}

$manifest = [ordered]@{
	name = $hostName
	description = 'Obsidian Web Clipper Codex CLI native bridge'
	path = $hostPath
	type = 'stdio'
	allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding UTF8

if ($Browser -eq 'Chrome') {
	$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
} else {
	$registryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
}

New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

Write-Output "Installed $hostName for $Browser"
Write-Output "Manifest: $manifestPath"
Write-Output "Host: $hostPath"
