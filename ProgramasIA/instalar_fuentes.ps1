# Instala para el usuario actual (sin permisos de administrador) todas las
# fuentes .ttf/.otf de una carpeta y avisa a los programas abiertos.
# Lo usan el panel (boton "Descargar fuentes que falten") y el instalador.
#   powershell -ExecutionPolicy Bypass -File instalar_fuentes.ps1 -Carpeta "C:\...\fuentes" [-Listo "C:\...\listo.txt"]
param([Parameter(Mandatory = $true)][string]$Carpeta, [string]$Listo = "")

$ErrorActionPreference = "Continue"
$destino = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
$registro = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
New-Item -ItemType Directory -Force $destino | Out-Null
if (-not (Test-Path $registro)) { New-Item $registro -Force | Out-Null }

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class FuentesWin {
  [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern int AddFontResource(string f);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
}
"@ -ErrorAction SilentlyContinue

# fuentes que ya estan en el sistema (para no duplicar)
$sistema = @{}
foreach ($d in @("$env:WINDIR\Fonts", $destino)) {
  Get-ChildItem $d -File -ErrorAction SilentlyContinue | ForEach-Object { $sistema[$_.Name.ToLower()] = $true }
}

$instaladas = 0; $ya = 0; $errores = @()
Get-ChildItem $Carpeta -Recurse -File -Include *.ttf, *.otf | ForEach-Object {
  $f = $_
  try {
    if ($sistema.ContainsKey($f.Name.ToLower())) { $ya++; return }
    $copia = Join-Path $destino $f.Name
    Copy-Item $f.FullName $copia -Force
    # nombre visible para el registro: "Familia Estilo (TrueType)"
    $nombre = [IO.Path]::GetFileNameWithoutExtension($f.Name)
    try {
      $pfc = New-Object System.Drawing.Text.PrivateFontCollection
      $pfc.AddFontFile($copia)
      if ($pfc.Families.Count -gt 0) { $nombre = $pfc.Families[0].Name + " " + ($nombre -replace '^.*-', '') }
      $pfc.Dispose()
    } catch {}
    $tipo = if ($f.Extension -ieq ".otf") { "OpenType" } else { "TrueType" }
    Set-ItemProperty -Path $registro -Name "$nombre ($tipo)" -Value $copia
    [void][FuentesWin]::AddFontResource($copia)
    $instaladas++
  } catch { $errores += "$($f.Name): $($_.Exception.Message)" }
}
# avisar a los programas abiertos (InDesign) que cambiaron las fuentes
try { $r = [IntPtr]::Zero; [void][FuentesWin]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 3000, [ref]$r) } catch {}

$msg = "instaladas=$instaladas|ya=$ya|errores=" + ($errores -join "; ")
Write-Output $msg
if ($Listo) { Set-Content -Path $Listo -Value $msg -Encoding UTF8 }
