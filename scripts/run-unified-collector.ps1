param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath,
  [Parameter(Mandatory = $true)]
  [string]$PythonPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$env:VAULT2077_PYTHON = $PythonPath
$env:VAULT2077_COLLECTOR_OUTPUT_DIR = $OutputDirectory

& $NodePath `
  --conditions=react-server `
  --experimental-strip-types `
  scripts/collect-unified-acquisition.ts

exit $LASTEXITCODE
