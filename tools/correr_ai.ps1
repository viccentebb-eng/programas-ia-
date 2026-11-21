# Corre a_una_tinta.jsx en Illustrator por COM. Uso: correr_ai.ps1 entrada salida
param([string]$entrada, [string]$salida)
$ai = New-Object -ComObject Illustrator.Application
$code = "var ENTRADA = '" + $entrada.Replace('\','/') + "'; var SALIDA = '" + $salida.Replace('\','/') + "';`n" + (Get-Content (Join-Path $PSScriptRoot "..\ProgramasIA\a_una_tinta.jsx") -Raw -Encoding UTF8)
Write-Output ("RESULT: " + $ai.DoJavaScript($code))
