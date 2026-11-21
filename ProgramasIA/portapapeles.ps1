# Guarda como PNG la imagen que haya en el portapapeles (captura con Win+Shift+S o
# "Copiar imagen"), o la primera imagen si copiaron un archivo. La lanza el panel.
#   powershell -STA -File portapapeles.ps1 -Salida x.png -Listo listo.txt
# Escribe en -Listo: "ok", "vacio" o "error|motivo".
param([Parameter(Mandatory = $true)][string]$Salida, [Parameter(Mandatory = $true)][string]$Listo)
$r = "vacio"
try {
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $img = $null
  if ([Windows.Forms.Clipboard]::ContainsImage()) { $img = [Windows.Forms.Clipboard]::GetImage() }
  elseif ([Windows.Forms.Clipboard]::ContainsFileDropList()) {
    foreach ($f in [Windows.Forms.Clipboard]::GetFileDropList()) {
      if ($f -match '\.(png|jpe?g|bmp|gif|webp)$') { $img = [Drawing.Image]::FromFile($f); break }
    }
  }
  if ($img) {
    # maximo 1600 px de lado: suficiente para que Claude lea y ligero para mandar
    $esc = [Math]::Min(1.0, 1600 / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $esc); $h = [int]($img.Height * $esc)
    $bmp = New-Object Drawing.Bitmap $w, $h
    $g = [Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = "HighQualityBicubic"
    $g.DrawImage($img, 0, 0, $w, $h); $g.Dispose()
    $bmp.Save($Salida, [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); $img.Dispose()
    $r = "ok"
  }
} catch { $r = "error|" + $_.Exception.Message }
Set-Content -Path $Listo -Value $r -Encoding ASCII
