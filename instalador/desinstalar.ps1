# Quita Programas IA: el panel, los scripts de InDesign, los accesos y la carpeta.
# Las fuentes se quedan instaladas (otros documentos pueden usarlas).
$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Windows.Forms
if (-not $env:PROGRAMASIA_SILENCIO) {
  $r = [System.Windows.Forms.MessageBox]::Show("¿Quitar Programas IA de esta computadora?`nLas fuentes y tus documentos se quedan.", "Programas IA", "YesNo", "Question")
  if ($r -ne "Yes") { exit }
}
# apagar el puente de internet y quitarlo del inicio de Windows
Get-NetTCPConnection -LocalPort 47811 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Remove-Item (Join-Path ([Environment]::GetFolderPath("Startup")) "Puente de Programas IA.lnk") -Force -ErrorAction SilentlyContinue
# quitar el conector de Claude Desktop y Codex
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$registrar = Join-Path $env:LOCALAPPDATA "Programas IA\conector\registrar.js"
if ($node -and (Test-Path $registrar)) { & $node $registrar --quitar | Out-Null }
$upia = Join-Path ${env:CommonProgramFiles} "Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
if (Test-Path $upia) { & $upia /remove "Programas IA" | Out-Null }
# por si se instalo con el plan B (copia directa)
$uxp = Join-Path $env:APPDATA "Adobe\UXP"
Get-ChildItem (Join-Path $uxp "Plugins\External") -Directory -Filter "mx.venegas.programasia_*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
$info = Join-Path $uxp "PluginsInfo\v1\ID.json"
if (Test-Path $info) {
  $d = Get-Content $info -Raw | ConvertFrom-Json
  $d = [pscustomobject]@{ plugins = @($d.plugins | Where-Object { $_.pluginId -ne "mx.venegas.programasia" }) }
  [IO.File]::WriteAllText($info, ($d | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
}
Get-ChildItem (Join-Path $env:APPDATA "Adobe\InDesign") -Directory -Filter "Version *" -ErrorAction SilentlyContinue | ForEach-Object {
  Get-ChildItem $_.FullName -Directory | ForEach-Object {
    $p = Join-Path $_.FullName "Scripts\Scripts Panel\Programas IA"
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
  }
}
Remove-Item (Join-Path ([Environment]::GetFolderPath("Programs")) "Programas IA") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ProgramasIA" -Recurse -Force -ErrorAction SilentlyContinue
$destino = Join-Path $env:LOCALAPPDATA "Programas IA"
# este script vive en esa carpeta: se borra cuando termine
Start-Process cmd -ArgumentList "/c timeout /t 2 >nul & rmdir /s /q `"$destino`"" -WindowStyle Hidden
if (-not $env:PROGRAMASIA_SILENCIO) { [void][System.Windows.Forms.MessageBox]::Show("Listo, Programas IA se quitó.", "Programas IA") }
