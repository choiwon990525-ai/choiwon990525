' Desktop icon -> open the scene capture tool (Chrome extension manage page) without a console window
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
ps1 = fs.GetParentFolderName(WScript.ScriptFullName) & "\open-clip-tool.ps1"
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
