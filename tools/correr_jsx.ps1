# Corre un .jsx en InDesign por COM y muestra lo que devuelve. Uso: correr_jsx.ps1 ruta.jsx
param([string]$jsx)
$id = $null
foreach ($p in "InDesign.Application.2026","InDesign.Application") { try { $id = New-Object -ComObject $p; break } catch {} }
if (-not $id) { Write-Output "NO_COM"; exit 1 }
$ruta = (Get-Item $jsx).FullName.Replace('\','/')
$code = 'var __r; try { __r = $.evalFile(File("' + $ruta + '")); } catch (e) { __r = "EXC " + e + " linea " + e.line; } String(__r);'
$r = $id.DoScript($code, 1246973031)
Write-Output ("RESULT: " + $r)
