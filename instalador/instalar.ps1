# =====================================================================
#  Instalador de Programas IA (panel para InDesign) - Windows
#  No necesita permisos de administrador. Hace todo esto:
#   1. Copia el programa a %LOCALAPPDATA%\Programas IA
#   2. Instala las fuentes (Lora, Playfair Display, Pinyon Script); si falta
#      alguna en el paquete la baja de Google Fonts
#   3. Pone la prueba del motor y MedidasPlantillas en el panel Scripts de InDesign
#   4. Instala el panel con el instalador de complementos de Adobe
#   5. Crea accesos en el menu Inicio y la entrada para desinstalar
# =====================================================================
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Instalar Programas IA"
$origen = $PSScriptRoot
$paquete = Join-Path $origen "paquete"
if (-not (Test-Path (Join-Path $paquete "ProgramasIA.ccx"))) {
  # el .exe trae todo en paquete.zip
  $zip = Join-Path $origen "paquete.zip"
  if (Test-Path $zip) {
    $paquete = Join-Path $env:TEMP ("ProgramasIA_" + [guid]::NewGuid().ToString("N"))
    Expand-Archive -Path $zip -DestinationPath $paquete -Force
  } else { $paquete = $origen }
}
$version = (Get-Content (Join-Path $paquete "VERSION.txt") -ErrorAction SilentlyContinue | Select-Object -First 1)
$destino = Join-Path $env:LOCALAPPDATA "Programas IA"
$notas = New-Object System.Collections.Generic.List[string]

function Paso($n, $t) { Write-Host ""; Write-Host "[$n/5] $t" -ForegroundColor Cyan }
function Bien($t) { Write-Host "   OK  $t" -ForegroundColor Green }
function Ojo($t) { Write-Host "   !!  $t" -ForegroundColor Yellow; $notas.Add($t) }

Write-Host "============================================" -ForegroundColor White
Write-Host "  Programas IA $version - instalador" -ForegroundColor White
Write-Host "============================================" -ForegroundColor White

# ---------------------------------------------------------------- 1
Paso 1 "Copiando archivos a $destino"
New-Item -ItemType Directory -Force $destino | Out-Null
foreach ($x in "ProgramasIA", "scripts", "fuentes") {
  if (Test-Path (Join-Path $destino $x)) { Remove-Item (Join-Path $destino $x) -Recurse -Force }
}
Copy-Item (Join-Path $paquete "*") $destino -Recurse -Force
Bien "archivos copiados"

# ---------------------------------------------------------------- 2
Paso 2 "Instalando fuentes"
$carpetaFuentes = Join-Path $destino "fuentes"
New-Item -ItemType Directory -Force $carpetaFuentes | Out-Null
$necesarias = @("Lora", "Playfair Display", "Pinyon Script")
foreach ($fam in $necesarias) {
  $base = $fam -replace " ", ""
  if (Get-ChildItem $carpetaFuentes -Filter "$base*.ttf" -ErrorAction SilentlyContinue) { continue }
  try {
    Write-Host "   bajando $fam de Google Fonts..."
    $q = $fam -replace " ", "+"
    $css = $null
    foreach ($f in @("${q}:ital,wght@0,400;0,700;1,400;1,700", "${q}:ital@0;1", $q)) {
      try { $css = (Invoke-WebRequest -UseBasicParsing -UserAgent "ProgramasIA/1.0" "https://fonts.googleapis.com/css2?family=$f").Content; break } catch {}
    }
    if (-not $css) { throw "Google Fonts no la tiene" }
    $vistos = @{}
    foreach ($b in ($css -split "@font-face" | Select-Object -Skip 1)) {
      if ($b -notmatch "url\((https:[^)]+\.ttf)\)") { continue }
      $url = $Matches[1]; if ($vistos[$url]) { continue }; $vistos[$url] = 1
      $peso = if ($b -match "font-weight:\s*700") { "Bold" } else { "Regular" }
      $cur = if ($b -match "font-style:\s*italic") { "Italic" } else { "" }
      $nom = "$base-" + (("$peso$cur") -replace "RegularItalic", "Italic") + ".ttf"
      Invoke-WebRequest -UseBasicParsing $url -OutFile (Join-Path $carpetaFuentes $nom)
    }
  } catch { Ojo "No pude bajar la fuente $fam ($($_.Exception.Message)). El panel la puede bajar despues desde Ajustes." }
}
$r = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destino "ProgramasIA\instalar_fuentes.ps1") -Carpeta $carpetaFuentes
Bien "fuentes: $r"

# ---------------------------------------------------------------- 3
Paso 3 "Agregando scripts al panel Scripts de InDesign"
$versiones = Get-ChildItem (Join-Path $env:APPDATA "Adobe\InDesign") -Directory -Filter "Version *" -ErrorAction SilentlyContinue
$puestos = 0
foreach ($v in $versiones) {
  foreach ($idioma in (Get-ChildItem $v.FullName -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^[a-z]{2}_[A-Z]{2}$" })) {
    $panel = Join-Path $idioma.FullName "Scripts\Scripts Panel\Programas IA"
    if (Test-Path $panel) { Remove-Item $panel -Recurse -Force }
    New-Item -ItemType Directory -Force $panel | Out-Null
    Copy-Item (Join-Path $destino "scripts\*") $panel -Recurse -Force
    $puestos++
  }
}
if ($puestos) { Bien "scripts en $puestos version(es) de InDesign (carpeta 'Programas IA' del panel Scripts)" }
else { Ojo "No encontre InDesign en este usuario. Abre InDesign una vez y vuelve a correr el instalador para tener los scripts." }

# ---------------------------------------------------------------- 4
Paso 4 "Instalando el panel en InDesign"
$ccx = Join-Path $destino "ProgramasIA.ccx"
$upia = Join-Path ${env:CommonProgramFiles} "Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
$listo = $false
$manifest = Get-Content (Join-Path $destino "ProgramasIA\manifest.json") -Raw | ConvertFrom-Json
if (Test-Path $upia) {
  # UPIA sale con 0 aunque falle: hay que leer lo que escribe
  $salida = (& $upia /install "$ccx" 2>&1 | Out-String)
  if ($salida -match "(?i)successfully" -and $salida -notmatch "(?i)failed") { $listo = $true; Bien "panel instalado con el instalador de Adobe" }
  else { Write-Host ("   el instalador de Adobe respondio: " + ($salida.Trim() -replace "\s+", " ")) }
}
if (-not $listo) {
  # Plan B: lo mismo que hace el instalador de Adobe, a mano: copiar el panel a la carpeta
  # de complementos UXP del usuario y registrarlo para InDesign (ID).
  try {
    $uxp = Join-Path $env:APPDATA "Adobe\UXP"
    $nombreDir = "$($manifest.id)_$($manifest.version)"
    $ext = Join-Path $uxp "Plugins\External"
    New-Item -ItemType Directory -Force $ext | Out-Null
    Get-ChildItem $ext -Directory -Filter "$($manifest.id)_*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
    Copy-Item (Join-Path $destino "ProgramasIA") (Join-Path $ext $nombreDir) -Recurse -Force
    $infoDir = Join-Path $uxp "PluginsInfo\v1"
    New-Item -ItemType Directory -Force $infoDir | Out-Null
    $info = Join-Path $infoDir "ID.json"
    $datos = if (Test-Path $info) { Get-Content $info -Raw | ConvertFrom-Json } else { [pscustomobject]@{ plugins = @() } }
    $otros = @($datos.plugins | Where-Object { $_.pluginId -ne $manifest.id })
    $nuevo = [pscustomobject]@{
      hostMinVersion = $manifest.host.minVersion; name = $manifest.name; path = "`$localPlugins\External\$nombreDir"
      pluginId = $manifest.id; status = "enabled"; type = "uxp"; versionString = $manifest.version
    }
    $datos = [pscustomobject]@{ plugins = @($otros + $nuevo) }
    [IO.File]::WriteAllText($info, ($datos | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
    $listo = $true
    Bien "panel copiado a los complementos de InDesign"
  } catch { Ojo "No pude copiar el panel: $($_.Exception.Message)" }
  $notas.Add("Si al abrir InDesign no aparece Programas IA en el menu Complementos, dale doble clic a ProgramasIA.ccx en la carpeta de Programas IA (menu Inicio).")
}

# ---------------------------------------------------------------- 5
Paso 5 "Accesos y desinstalador"
$menu = Join-Path ([Environment]::GetFolderPath("Programs")) "Programas IA"
New-Item -ItemType Directory -Force $menu | Out-Null
$sh = New-Object -ComObject WScript.Shell
$l = $sh.CreateShortcut((Join-Path $menu "Leeme de Programas IA.lnk")); $l.TargetPath = (Join-Path $destino "LEEME.txt"); $l.Save()
$l = $sh.CreateShortcut((Join-Path $menu "Carpeta de Programas IA.lnk")); $l.TargetPath = $destino; $l.Save()
$l = $sh.CreateShortcut((Join-Path $menu "Desinstalar Programas IA.lnk"))
$l.TargetPath = "powershell.exe"; $l.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$destino\desinstalar.ps1`""; $l.Save()
$reg = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ProgramasIA"
New-Item $reg -Force | Out-Null
Set-ItemProperty $reg DisplayName "Programas IA (panel para InDesign)"
Set-ItemProperty $reg DisplayVersion "$version"
Set-ItemProperty $reg Publisher "Programas IA"
Set-ItemProperty $reg InstallLocation $destino
Set-ItemProperty $reg UninstallString "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$destino\desinstalar.ps1`""
Set-ItemProperty $reg NoModify 1 -Type DWord; Set-ItemProperty $reg NoRepair 1 -Type DWord
Bien "accesos en el menu Inicio > Programas IA"

# ---------------------------------------------------------------- fin
$msg = "Programas IA quedo instalado.`n`nQue sigue:`n1. Cierra y abre InDesign.`n2. Menu Complementos (Plug-ins) > Programas IA.`n3. En Ajustes pega tu clave de Claude y da Conectar."
if ($notas.Count) { $msg += "`n`nRevisa:`n- " + ($notas -join "`n- ") }
Write-Host ""; Write-Host $msg -ForegroundColor White
if (-not $env:PROGRAMASIA_SILENCIO) {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($msg, "Programas IA", "OK", $(if ($notas.Count) { "Warning" } else { "Information" }))
}
