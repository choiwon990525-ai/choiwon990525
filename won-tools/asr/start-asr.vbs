Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
base = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\Documents\won-tools\asr\"
exe = ""
For Each c In Array("bin-gpu\whisper-server.exe", "bin-gpu\Release\whisper-server.exe", "bin2\whisper-server.exe", "bin\whisper-server.exe")
  If exe = "" And fs.FileExists(base & c) Then exe = base & c
Next
' v1.11.0: use the big model (ggml-large-v3-q5_0, better Korean) when it exists, otherwise the fast turbo model
mdl = base & "models\ggml-large-v3-turbo-q5_0.bin"
If fs.FileExists(base & "models\ggml-large-v3-q5_0.bin") Then mdl = base & "models\ggml-large-v3-q5_0.bin"
n = sh.ExpandEnvironmentStrings("%NUMBER_OF_PROCESSORS%")
sh.Run """" & exe & """ -m """ & mdl & """ --host 127.0.0.1 --port 5005 -l ko -t " & n & " -bs 5 -nt", 0, False
