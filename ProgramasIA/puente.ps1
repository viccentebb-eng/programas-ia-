# =====================================================================
#  Puente local de Programas IA
#  InDesign tiene bloqueada la salida a internet (regla de firewall), pero si
#  puede hablar con esta computadora. Este puente escucha SOLO en 127.0.0.1 y
#  pasa las peticiones del panel a tres sitios, nada mas:
#     /anthropic/...  ->  https://api.anthropic.com/...
#     /gfonts/...     ->  https://fonts.googleapis.com/...
#     /gstatic/...    ->  https://fonts.gstatic.com/...
#  No guarda ni escribe claves. Lo arranca Windows al iniciar sesion y,
#  si no esta corriendo, el propio panel.
# =====================================================================
param([int]$Puerto = 47811)
$ErrorActionPreference = "Stop"
$destinos = @{ "anthropic" = "https://api.anthropic.com"; "gfonts" = "https://fonts.googleapis.com"; "gstatic" = "https://fonts.gstatic.com" }
$pasan = @("content-type", "x-api-key", "anthropic-version", "anthropic-beta", "user-agent")

$dirLog = Join-Path $env:LOCALAPPDATA "Programas IA"
New-Item -ItemType Directory -Force $dirLog | Out-Null
$log = Join-Path $dirLog "puente.log"
function Anota($t) { try { Add-Content -Path $log -Value ((Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $t) -Encoding UTF8 } catch {} }
if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Remove-Item $log -Force }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$cliente = New-Object System.Net.Http.HttpClient
$cliente.Timeout = [TimeSpan]::FromMinutes(10)

# un solo puente a la vez: si el puerto ya esta ocupado, ya hay otro corriendo
$escucha = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Puerto)
try { $escucha.Start() } catch { Anota "ya hay un puente en el puerto $Puerto"; exit 0 }
Anota "puente escuchando en 127.0.0.1:$Puerto"

function LeeLinea($s) {
  $b = New-Object System.Collections.Generic.List[byte]
  while ($true) { $x = $s.ReadByte(); if ($x -lt 0) { break }; if ($x -eq 10) { break }; if ($x -ne 13) { $b.Add([byte]$x) } }
  return [Text.Encoding]::ASCII.GetString($b.ToArray())
}
function Responde($s, [int]$codigo, [string]$tipo, [byte[]]$cuerpo) {
  $cab = "HTTP/1.1 $codigo X`r`nContent-Type: $tipo`r`nContent-Length: $($cuerpo.Length)`r`nConnection: close`r`n`r`n"
  $h = [Text.Encoding]::ASCII.GetBytes($cab)
  $s.Write($h, 0, $h.Length); if ($cuerpo.Length) { $s.Write($cuerpo, 0, $cuerpo.Length) }; $s.Flush()
}

while ($true) {
  $con = $escucha.AcceptTcpClient()
  try {
    $s = $con.GetStream(); $s.ReadTimeout = 30000
    $primera = LeeLinea $s
    if (-not $primera) { $con.Close(); continue }
    $partes = $primera.Split(" "); $metodo = $partes[0]; $ruta = $partes[1]
    $cabs = @{}
    while ($true) { $l = LeeLinea $s; if ($l -eq "") { break }; $i = $l.IndexOf(":"); if ($i -gt 0) { $cabs[$l.Substring(0, $i).Trim().ToLower()] = $l.Substring($i + 1).Trim() } }
    $largo = 0; if ($cabs["content-length"]) { $largo = [int]$cabs["content-length"] }
    $cuerpo = New-Object byte[] $largo; $leido = 0
    while ($leido -lt $largo) { $n = $s.Read($cuerpo, $leido, $largo - $leido); if ($n -le 0) { break }; $leido += $n }

    if ($ruta -eq "/ping") { Responde $s 200 "text/plain" ([Text.Encoding]::UTF8.GetBytes("programas-ia-puente")); $con.Close(); continue }
    $m = [regex]::Match($ruta, "^/(anthropic|gfonts|gstatic)(/.*)$")
    if (-not $m.Success) { Responde $s 404 "text/plain" ([Text.Encoding]::UTF8.GetBytes("ruta no permitida")); $con.Close(); continue }
    $url = $destinos[$m.Groups[1].Value] + $m.Groups[2].Value

    $pet = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::new($metodo), $url)
    if ($largo -gt 0) {
      $pet.Content = New-Object System.Net.Http.ByteArrayContent(, $cuerpo)
      if ($cabs["content-type"]) { $pet.Content.Headers.TryAddWithoutValidation("Content-Type", $cabs["content-type"]) | Out-Null }
    }
    foreach ($k in $pasan) { if ($k -ne "content-type" -and $cabs[$k]) { $pet.Headers.TryAddWithoutValidation($k, $cabs[$k]) | Out-Null } }
    $t = Get-Date
    $res = $cliente.SendAsync($pet).GetAwaiter().GetResult()
    $datos = $res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $tipo = "application/octet-stream"; if ($res.Content.Headers.ContentType) { $tipo = $res.Content.Headers.ContentType.ToString() }
    Responde $s ([int]$res.StatusCode) $tipo $datos
    Anota ("{0} {1} -> {2} ({3:N1} s)" -f $metodo, ($url -replace "\?.*$", ""), [int]$res.StatusCode, ((Get-Date) - $t).TotalSeconds)
  } catch {
    Anota ("error: " + $_.Exception.Message)
    try { Responde $s 502 "text/plain" ([Text.Encoding]::UTF8.GetBytes("puente: " + $_.Exception.Message)) } catch {}
  } finally { try { $con.Close() } catch {} }
}
