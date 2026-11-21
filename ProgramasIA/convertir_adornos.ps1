# Convierte adornos (vectores de Magnific) a una tinta con Illustrator, por lotes.
# Lo lanza el panel. Trabajo: JSON con [{ "entrada": ..., "salida": ...pdf, "miniatura": ...png }]
# Escribe en -Listo un JSON con el resultado de cada uno.
param([Parameter(Mandatory = $true)][string]$Trabajo, [Parameter(Mandatory = $true)][string]$Listo)
$ErrorActionPreference = "Continue"
$res = @()
try {
  $lista = Get-Content $Trabajo -Raw -Encoding UTF8 | ConvertFrom-Json
  $script = Get-Content (Join-Path $PSScriptRoot "a_una_tinta.jsx") -Raw -Encoding UTF8
  $yaAbierto = [bool](Get-Process Illustrator -ErrorAction SilentlyContinue)
  $ai = New-Object -ComObject Illustrator.Application
  foreach ($x in $lista) {
    $e = $x.entrada.Replace('\', '/'); $s = $x.salida.Replace('\', '/'); $m = "$($x.miniatura)".Replace('\', '/')
    $code = "var ENTRADA = " + (ConvertTo-Json $e) + "; var SALIDA = " + (ConvertTo-Json $s) + "; var MINIATURA = " + (ConvertTo-Json $m) + ";`n" + $script
    try { $r = [string]$ai.DoJavaScript($code) } catch { $r = "ERROR|" + $_.Exception.Message }
    $res += [pscustomobject]@{ entrada = $x.entrada; resultado = $r }
  }
  if (-not $yaAbierto) { try { $ai.Quit() } catch {} }
} catch {
  $res += [pscustomobject]@{ entrada = ""; resultado = "ERROR|Illustrator: " + $_.Exception.Message }
}
[IO.File]::WriteAllText($Listo, (ConvertTo-Json @($res) -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
