# One-click installer for the coach's PC: TranscriberShortcut.bat = head.txt + base64 of the Transcriber files.
# Usage (from the repo root): python3 Transcriber/installer/build.py . Transcriber/installer/head.txt TranscriberShortcut.bat
# Double-clicked on the PC it finds the Transcriber folder, puts these files there (old ones go to _backup_*)
# and runs _shortcut.ps1 to make the Desktop shortcuts.
# - CRLF line endings everywhere (cmd.exe reads batch files)
# - cmd.exe reads a batch file in ~8 KB blocks from each line it runs. With a UTF-8 console code page a block
#   that ends inside a Korean character can stop cmd silently, so ASCII padding after 'exit /b' keeps every
#   block cmd reads free of Korean text.
import base64, sys
repo, head, out = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(head, encoding='utf-8').read().replace('\r\n', '\n').rstrip('\n')
cmd_part, ps_part = text.split('\n#PS_BEGIN\n', 1)
lines = cmd_part.split('\n')
cmd_bytes = len(('\r\n'.join(lines) + '\r\n').encode('ascii'))   # header must be pure ASCII
pad_line = 'rem ' + '-' * 72
need = cmd_bytes + 8192 + 4096          # first Korean byte must come after every block cmd can read
pad = ['rem ASCII padding: keeps the blocks cmd.exe reads free of Korean text (see Transcriber/installer/build.py).']
while len(('\r\n'.join(lines + pad) + '\r\n').encode('ascii')) < need:
    pad.append(pad_line)
parts = lines + pad + ['#PS_BEGIN'] + ps_part.split('\n')
for name in ['won-transcribe.ico', '_shortcut.ps1', '_fix.ps1', '권한복구.bat', '_transcribe.ps1', '사용법.md']:
    b64 = base64.b64encode(open(f'{repo}/Transcriber/{name}', 'rb').read()).decode()
    parts.append(f'#FILE {name}')
    parts += [b64[i:i + 76] for i in range(0, len(b64), 76)]
parts.append('#END')
data = ('\r\n'.join(parts) + '\r\n').encode('utf-8')
first_non_ascii = next(i for i, c in enumerate(data) if c > 127)
assert first_non_ascii >= cmd_bytes + 8192 + 1024, (first_non_ascii, cmd_bytes)
assert b'\n' not in data.replace(b'\r\n', b''), 'bare LF found'
open(out, 'wb').write(data)
print('wrote', out, len(data), 'bytes; cmd header', cmd_bytes, 'bytes; first non-ASCII byte at', first_non_ascii)
