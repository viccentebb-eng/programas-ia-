' Arranca el puente local de Programas IA sin ventana (lo usan el panel y el inicio de Windows)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\puente.ps1""", 0, False
