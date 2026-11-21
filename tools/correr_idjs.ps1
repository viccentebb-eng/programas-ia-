param([string]$f)
$id = New-Object -ComObject InDesign.Application.2026
$r = $id.DoScript((Get-Item $f).FullName, 1431522407)
Write-Output ("RESULT: " + $r)
