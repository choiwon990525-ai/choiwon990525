@echo off
rem ==================================================================
rem  ClassPen - Epic Pen style screen annotation tool for classes
rem  Double-click this file to start.
rem  First run (and after an update) builds ClassPen.exe with the
rem  C# compiler that ships with Windows (.NET Framework 4).
rem  Nothing is downloaded; the program lives in %LOCALAPPDATA%\ClassPen
rem ==================================================================
setlocal
set "CLASSPEN_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = [IO.File]::ReadAllText($env:CLASSPEN_SELF, [Text.Encoding]::UTF8); $a = $t.IndexOf('#PS' + '_BEGIN'); $b = $t.IndexOf('#PS' + '_END'); iex $t.Substring($a, $b - $a)"
exit /b %errorlevel%

#PS_BEGIN
# ---- PowerShell: 아래 C# 코드를 꺼내서 빌드하고 실행 ----
$ErrorActionPreference = 'Stop'
try {
    $all = [IO.File]::ReadAllText($env:CLASSPEN_SELF, [Text.Encoding]::UTF8)
    $at = $all.IndexOf('//#' + 'CSHARP#')
    if ($at -lt 0) { throw 'C# 코드 부분을 찾지 못했어요. 파일이 잘렸는지 확인해 주세요.' }
    $code = $all.Substring($at)

    $dir = Join-Path $env:LOCALAPPDATA 'ClassPen'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $exe = Join-Path $dir 'ClassPen.exe'
    $src = Join-Path $dir 'ClassPen.cs'
    $old = ''
    if (Test-Path $src) { $old = [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8) }

    if (($old -ne $code) -or -not (Test-Path $exe)) {
        Write-Host 'ClassPen 준비 중... (처음 한 번만 몇 초 걸려요)'
        Get-Process -Name ClassPen -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 300

        $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
        if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
        if (-not (Test-Path $csc)) { throw '윈도우 기본 C# 컴파일러(.NET Framework 4)를 찾지 못했어요.' }

        $tmp = Join-Path $dir 'build.cs'
        [IO.File]::WriteAllText($tmp, $code, (New-Object Text.UTF8Encoding($true)))
        $ErrorActionPreference = 'Continue'
        $log = & $csc /nologo /target:winexe /optimize+ /unsafe /codepage:65001 "/out:$exe" /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll $tmp 2>&1
        $rc = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($rc -ne 0) {
            $log | Out-String | Write-Host
            throw '빌드에 실패했어요. 위 내용을 캡처해서 보내 주세요.'
        }
        Move-Item -Force $tmp $src
    }

    # 시그니처 강아지는 프로그램 안에 들어 있다. ClassPen.bat 옆에 강아지.png 가 있으면 그 그림을 대신 쓴다.
    $here = Split-Path -Parent $env:CLASSPEN_SELF
    $cfg = Join-Path $env:APPDATA 'ClassPen'
    $sig = Join-Path $cfg 'signature.png'
    $custom = $null
    foreach ($name in @('강아지.png', 'WON캐릭터_누끼.png')) {
        $c = Join-Path $here $name
        if (Test-Path -LiteralPath $c) { $custom = $c; break }
    }
    if ($custom) {
        if (-not (Test-Path $cfg)) { New-Item -ItemType Directory -Path $cfg | Out-Null }
        Copy-Item -LiteralPath $custom -Destination $sig -Force
    }
    elseif (Test-Path -LiteralPath $sig) {
        Remove-Item -LiteralPath $sig -Force   # 바꿔 둔 그림을 치우면 기본 강아지로 돌아간다
    }

    Start-Process -FilePath $exe
    exit 0
}
catch {
    Write-Host ''
    Write-Host ('ClassPen 오류: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Enter 를 누르면 창이 닫혀요.'
    [void](Read-Host)
    exit 1
}
#PS_END

//#CSHARP#
// ClassPen - 화면 위에 바로 그리는 수업용 판서 도구 (Epic Pen 스타일)
// 이 C# 코드는 ClassPen.bat 이 윈도우에 기본으로 들어 있는 C# 컴파일러(.NET Framework 4)로 빌드합니다.
// C# 5 문법만 사용합니다 (윈도우 기본 컴파일러가 C# 5까지만 지원).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ClassPen
{
    static class Program
    {
        static bool showingError;

        [STAThread]
        static void Main()
        {
            bool first;
            using (var mutex = new System.Threading.Mutex(true, "Local\\ClassPen.SingleInstance", out first))
            {
                if (!first)
                {
                    // 이미 켜져 있으면 기존 창에 툴바를 보여 달라고 알리고 끝낸다.
                    Native.PostMessage(Native.HWND_BROADCAST, Native.RegisterWindowMessage(Overlay.ShowMessageName), IntPtr.Zero, IntPtr.Zero);
                    return;
                }
                Native.EnableDpiAwareness();
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.ThreadException += delegate(object s, System.Threading.ThreadExceptionEventArgs e)
                {
                    if (showingError) return;
                    showingError = true;
                    // 항상 위에 떠 있는 그림판 뒤로 숨지 않도록 맨 위 메시지 상자로 띄운다.
                    MessageBox.Show("ClassPen 오류: " + e.Exception.Message, "ClassPen", MessageBoxButtons.OK, MessageBoxIcon.Warning,
                        MessageBoxDefaultButton.Button1, MessageBoxOptions.DefaultDesktopOnly);
                    showingError = false;
                };
                Application.Run(new Overlay());
                GC.KeepAlive(mutex);
            }
        }
    }

    // ------------------------------------------------------------------
    // Win32
    // ------------------------------------------------------------------
    static class Native
    {
        public const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x8000000, WS_EX_TOPMOST = 0x8;
        public const int GWL_EXSTYLE = -20;
        public const int WM_HOTKEY = 0x312, WM_MOUSEACTIVATE = 0x21, MA_NOACTIVATE = 3, WM_DPICHANGED = 0x2E0;
        public const int ULW_ALPHA = 2;
        public const uint SWP_NOSIZE = 1, SWP_NOMOVE = 2, SWP_NOACTIVATE = 0x10;
        public const int MOD_ALT = 1, MOD_CONTROL = 2, MOD_NOREPEAT = 0x4000;
        public const uint WDA_NONE = 0, WDA_EXCLUDEFROMCAPTURE = 0x11;
        public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        public static readonly IntPtr HWND_BROADCAST = new IntPtr(0xffff);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X, Y; public POINT(int x, int y) { X = x; Y = y; } }

        [StructLayout(LayoutKind.Sequential)]
        public struct SIZE { public int CX, CY; public SIZE(int cx, int cy) { CX = cx; CY = cy; } }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        public struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }

        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAPINFOHEADER
        {
            public int biSize, biWidth, biHeight;
            public short biPlanes, biBitCount;
            public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct ULWINFO
        {
            public int cbSize;
            public IntPtr hdcDst, pptDst, psize, hdcSrc, pptSrc;
            public int crKey;
            public IntPtr pblend;
            public int dwFlags;
            public IntPtr prcDirty;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct ICONINFO { public bool fIcon; public int xHotspot, yHotspot; public IntPtr hbmMask, hbmColor; }

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UpdateLayeredWindowIndirect(IntPtr hwnd, ref ULWINFO info);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFOHEADER bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("gdi32.dll")] public static extern bool GdiFlush();
        [DllImport("kernel32.dll", EntryPoint = "RtlMoveMemory")] public static extern void CopyMemory(IntPtr dst, IntPtr src, IntPtr count);
        [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
        [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hwnd, int index, int value);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SetProp(IntPtr hwnd, string name, IntPtr data);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern ushort GlobalAddAtom(string name);
        [DllImport("kernel32.dll")] static extern ushort GlobalDeleteAtom(ushort atom);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hwnd, int id, int mods, int vk);
        [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hwnd, int id);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int RegisterWindowMessage(string name);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);
        [DllImport("user32.dll")] public static extern IntPtr CreateIconIndirect(ref ICONINFO info);
        [DllImport("user32.dll")] public static extern bool GetIconInfo(IntPtr hIcon, out ICONINFO info);
        [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
        [DllImport("user32.dll")] public static extern bool DestroyCursor(IntPtr h);
        [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
        [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int value);
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DllImport("imm32.dll")] static extern int ImmGetVirtualKey(IntPtr hwnd);
        [DllImport("dwmapi.dll")] static extern int DwmFlush();

        public static void EnableDpiAwareness()
        {
            // 모니터별 DPI 를 직접 다뤄야 확대 배율(125%, 150%)에서도 그림이 흐려지지 않는다.
            try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch (Exception) { }
            try { if (SetProcessDpiAwareness(2) == 0) return; } catch (Exception) { }
            try { SetProcessDPIAware(); } catch (Exception) { }
        }

        public static float SystemScale()
        {
            try { using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) return g.DpiX / 96f; }
            catch (Exception) { return 1f; }
        }

        public static float WindowScale(IntPtr hwnd)
        {
            try { uint dpi = GetDpiForWindow(hwnd); if (dpi > 0) return dpi / 96f; } catch (Exception) { }
            return SystemScale();
        }

        public static bool ExcludeFromCapture(IntPtr hwnd, bool exclude)
        {
            try { return SetWindowDisplayAffinity(hwnd, exclude ? WDA_EXCLUDEFROMCAPTURE : WDA_NONE) && exclude; }
            catch (Exception) { return false; }
        }

        public static Keys RealKey(IntPtr hwnd, Keys key)
        {
            // 한글 입력 상태에서는 글자 키가 ProcessKey 로 들어오므로 실제 키를 다시 얻는다.
            if (key != Keys.ProcessKey) return key;
            try { return (Keys)ImmGetVirtualKey(hwnd); } catch (Exception) { return key; }
        }

        // 펜 태블릿으로 그릴 때 '길게 눌러 우클릭'·플릭 제스처가 끼어들지 않게 한다.
        public static void DisableTabletGestures(IntPtr hwnd)
        {
            const string name = "MicrosoftTabletPenServiceProperty";
            try
            {
                ushort atom = GlobalAddAtom(name);
                SetProp(hwnd, name, new IntPtr(0x10019));
                if (atom != 0) GlobalDeleteAtom(atom);
            }
            catch (Exception) { }
        }

        public static bool IsOwnWindow(IntPtr hwnd)
        {
            uint pid;
            if (hwnd == IntPtr.Zero || GetWindowThreadProcessId(hwnd, out pid) == 0) return false;
            return pid == (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
        }

        public static void WaitForCompositor()
        {
            try { DwmFlush(); DwmFlush(); } catch (Exception) { }
            System.Threading.Thread.Sleep(40);
        }
    }

    // ------------------------------------------------------------------
    // 색, 글꼴, 기하 도우미
    // ------------------------------------------------------------------
    static class Theme
    {
        public static readonly Color Surface = Color.FromArgb(18, 21, 29);
        public static readonly Color Border = Color.FromArgb(44, 50, 68);
        public static readonly Color Hover = Color.FromArgb(32, 37, 51);
        public static readonly Color Pressed = Color.FromArgb(44, 50, 68);
        public static readonly Color Checked = Color.FromArgb(58, 30, 38);
        public static readonly Color CheckedHover = Color.FromArgb(74, 36, 46);
        public static readonly Color Accent = Color.FromArgb(255, 70, 85);
        public static readonly Color Icon = Color.FromArgb(205, 210, 224);
        public static readonly Color Dim = Color.FromArgb(78, 84, 104);
        public static readonly Color Text = Color.FromArgb(237, 239, 245);

        public static readonly Color[] Palette =
        {
            Color.FromArgb(255, 70, 85), Color.FromArgb(255, 154, 60), Color.FromArgb(255, 225, 77), Color.FromArgb(59, 227, 138),
            Color.FromArgb(47, 212, 198), Color.FromArgb(61, 139, 255), Color.FromArgb(255, 255, 255), Color.FromArgb(21, 23, 29)
        };
        public static readonly string[] PaletteNames = { "빨강", "주황", "노랑", "초록", "청록", "파랑", "흰색", "검정" };
        public const int WhiteIndex = 6, BlackIndex = 7;

        static FontFamily family;

        public static FontFamily TextFamily
        {
            get
            {
                if (family != null) return family;
                foreach (string name in new[] { "Malgun Gothic", "NanumGothic" })
                {
                    try { family = new FontFamily(name); return family; } catch (ArgumentException) { }
                }
                family = FontFamily.GenericSansSerif;
                return family;
            }
        }
    }

    static class Geo
    {
        public static float Dist(PointF a, PointF b)
        {
            float dx = a.X - b.X, dy = a.Y - b.Y;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }

        public static float SegDist(PointF p, PointF a, PointF b)
        {
            float dx = b.X - a.X, dy = b.Y - a.Y, len2 = dx * dx + dy * dy;
            float t = len2 > 0f ? ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / len2 : 0f;
            if (t < 0f) t = 0f; else if (t > 1f) t = 1f;
            float x = a.X + t * dx - p.X, y = a.Y + t * dy - p.Y;
            return (float)Math.Sqrt(x * x + y * y);
        }

        public static int Clamp(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

        public static Color Fade(Color c, float alpha)
        {
            return Color.FromArgb(Clamp((int)Math.Round(c.A * alpha), 0, 255), c.R, c.G, c.B);
        }

        public static bool IsLight(Color c) { return (c.R * 299 + c.G * 587 + c.B * 114) / 1000 > 150; }

        public static Rectangle Outer(RectangleF r)
        {
            return Rectangle.FromLTRB((int)Math.Floor(r.Left) - 1, (int)Math.Floor(r.Top) - 1, (int)Math.Ceiling(r.Right) + 1, (int)Math.Ceiling(r.Bottom) + 1);
        }

        public static bool IsEmpty(Rectangle r) { return r.Width <= 0 || r.Height <= 0; }

        public static Rectangle Union(Rectangle a, Rectangle b)
        {
            if (IsEmpty(a)) return b;
            if (IsEmpty(b)) return a;
            return Rectangle.Union(a, b);
        }

        public static PointF Snap45(PointF a, PointF b)
        {
            double dx = b.X - a.X, dy = b.Y - a.Y, len = Math.Sqrt(dx * dx + dy * dy);
            double step = Math.PI / 4, ang = Math.Round(Math.Atan2(dy, dx) / step) * step;
            return new PointF((float)(a.X + Math.Cos(ang) * len), (float)(a.Y + Math.Sin(ang) * len));
        }

        public static RectangleF BoxFrom(PointF a, PointF b, bool square)
        {
            float dx = b.X - a.X, dy = b.Y - a.Y;
            if (square)
            {
                float m = Math.Max(Math.Abs(dx), Math.Abs(dy));
                dx = dx < 0 ? -m : m;
                dy = dy < 0 ? -m : m;
            }
            return RectangleF.FromLTRB(Math.Min(a.X, a.X + dx), Math.Min(a.Y, a.Y + dy), Math.Max(a.X, a.X + dx), Math.Max(a.Y, a.Y + dy));
        }

        public static GraphicsPath RoundRect(RectangleF r, float radius)
        {
            var p = new GraphicsPath();
            float d = Math.Min(radius * 2f, Math.Min(r.Width, r.Height));
            if (d < 1f) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        // 마우스 점들을 중점 기준 베지어로 이어 손떨림 없이 매끈한 선을 만든다.
        public static GraphicsPath SmoothPath(List<PointF> pts)
        {
            var path = new GraphicsPath();
            int n = pts.Count;
            if (n < 3)
            {
                path.AddLines(n == 1 ? new[] { pts[0], pts[0] } : pts.ToArray());
                return path;
            }
            var bz = new PointF[(n - 2) * 3 + 1];
            PointF m0 = Mid(pts[0], pts[1]);
            bz[0] = m0;
            int k = 1;
            for (int i = 1; i < n - 1; i++)
            {
                PointF c = pts[i], m1 = Mid(pts[i], pts[i + 1]);
                bz[k++] = new PointF(m0.X + (c.X - m0.X) * 2f / 3f, m0.Y + (c.Y - m0.Y) * 2f / 3f);
                bz[k++] = new PointF(m1.X + (c.X - m1.X) * 2f / 3f, m1.Y + (c.Y - m1.Y) * 2f / 3f);
                bz[k++] = m1;
                m0 = m1;
            }
            path.AddLine(pts[0], bz[0]);
            path.AddBeziers(bz);
            path.AddLine(bz[bz.Length - 1], pts[n - 1]);
            return path;
        }

        static PointF Mid(PointF a, PointF b) { return new PointF((a.X + b.X) / 2f, (a.Y + b.Y) / 2f); }

        public static void Prep(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        }
    }

    // ------------------------------------------------------------------
    // 그림 요소
    // ------------------------------------------------------------------
    enum Tool { Mouse, Pen, Highlighter, Laser, Line, Arrow, Rect, Ellipse, Text, Eraser, Stamp }
    enum Board { None, White, Black }
    enum StrokeKind { Pen, Highlighter, Laser }

    abstract class Shape
    {
        public Color Color;
        public float Width;
        public abstract RectangleF Bounds { get; }
        public abstract void Draw(Graphics g, float alpha);
        public abstract bool Hit(PointF p, float radius);
        public abstract void Offset(float dx, float dy);
        public virtual void Release() { }
    }

    sealed class StrokeShape : Shape
    {
        public StrokeKind Kind;
        public readonly List<PointF> Points = new List<PointF>();
        public bool Released;
        public int ReleasedAt;
        GraphicsPath path;
        int pathCount = -1;
        float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;

        public void Add(PointF p)
        {
            if (Points.Count > 0 && Geo.Dist(Points[Points.Count - 1], p) < 1.5f) return;
            Points.Add(p);
            minX = Math.Min(minX, p.X); minY = Math.Min(minY, p.Y);
            maxX = Math.Max(maxX, p.X); maxY = Math.Max(maxY, p.Y);
        }

        float Reach { get { return Kind == StrokeKind.Laser ? Width * 1.4f : Width / 2f; } }

        public override RectangleF Bounds
        {
            get
            {
                if (Points.Count == 0) return RectangleF.Empty;
                float r = Reach + 2f;
                return RectangleF.FromLTRB(minX - r, minY - r, maxX + r, maxY + r);
            }
        }

        GraphicsPath GetPath()
        {
            if (path == null || pathCount != Points.Count)
            {
                if (path != null) path.Dispose();
                path = Geo.SmoothPath(Points);
                pathCount = Points.Count;
            }
            return path;
        }

        public override void Draw(Graphics g, float alpha)
        {
            if (Points.Count == 0 || alpha <= 0f) return;
            if (Kind == StrokeKind.Laser)
            {
                Stroke(g, Geo.Fade(Color, 0.28f * alpha), Width * 2.6f);
                Stroke(g, Geo.Fade(Color, alpha), Width);
                Stroke(g, Geo.Fade(Color.White, 0.8f * alpha), Math.Max(1f, Width * 0.35f));
            }
            else if (Kind == StrokeKind.Highlighter)
                Stroke(g, Geo.Fade(Color, 0.42f * alpha), Width);
            else
                Stroke(g, Geo.Fade(Color, alpha), Width);
        }

        void Stroke(Graphics g, Color c, float w)
        {
            if (Points.Count == 1)
            {
                PointF p = Points[0];
                using (var b = new SolidBrush(c)) g.FillEllipse(b, p.X - w / 2f, p.Y - w / 2f, w, w);
                return;
            }
            using (var pen = new Pen(c, w))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;
                g.DrawPath(pen, GetPath());
            }
        }

        public override bool Hit(PointF p, float radius)
        {
            float r = radius + Width / 2f;
            if (p.X < minX - r || p.X > maxX + r || p.Y < minY - r || p.Y > maxY + r) return false;
            if (Points.Count == 1) return Geo.Dist(p, Points[0]) <= r;
            for (int i = 1; i < Points.Count; i++)
                if (Geo.SegDist(p, Points[i - 1], Points[i]) <= r) return true;
            return false;
        }

        public override void Offset(float dx, float dy)
        {
            for (int i = 0; i < Points.Count; i++) Points[i] = new PointF(Points[i].X + dx, Points[i].Y + dy);
            minX += dx; maxX += dx; minY += dy; maxY += dy;
            Release();
        }

        public override void Release()
        {
            if (path != null) { path.Dispose(); path = null; }
        }
    }

    sealed class LineShape : Shape
    {
        public PointF A, B;
        public bool Arrow;

        float HeadLength { get { return Math.Min(Width * 3.4f + 8f, Geo.Dist(A, B) * 0.75f); } }

        public override RectangleF Bounds
        {
            get
            {
                float r = Width / 2f + (Arrow ? HeadLength : 0f) + 2f;
                return RectangleF.FromLTRB(Math.Min(A.X, B.X) - r, Math.Min(A.Y, B.Y) - r, Math.Max(A.X, B.X) + r, Math.Max(A.Y, B.Y) + r);
            }
        }

        public override void Draw(Graphics g, float alpha)
        {
            Color c = Geo.Fade(Color, alpha);
            float len = Geo.Dist(A, B);
            using (var pen = new Pen(c, Width))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                if (!Arrow || len < 1f) { g.DrawLine(pen, A, B); return; }
                float head = HeadLength, hw = head * 0.55f;
                float ux = (B.X - A.X) / len, uy = (B.Y - A.Y) / len;
                var basePt = new PointF(B.X - ux * head, B.Y - uy * head);
                g.DrawLine(pen, A, basePt);
                PointF[] tri = { B, new PointF(basePt.X - uy * hw, basePt.Y + ux * hw), new PointF(basePt.X + uy * hw, basePt.Y - ux * hw) };
                using (var br = new SolidBrush(c)) g.FillPolygon(br, tri);
                using (var edge = new Pen(c, Math.Max(1f, Width * 0.5f)))
                {
                    edge.LineJoin = LineJoin.Round;
                    g.DrawPolygon(edge, tri);
                }
            }
        }

        public override bool Hit(PointF p, float radius)
        {
            if (Geo.SegDist(p, A, B) <= radius + Width / 2f) return true;
            return Arrow && Geo.Dist(p, B) <= radius + HeadLength * 0.6f;
        }

        public override void Offset(float dx, float dy)
        {
            A = new PointF(A.X + dx, A.Y + dy);
            B = new PointF(B.X + dx, B.Y + dy);
        }
    }

    sealed class BoxShape : Shape
    {
        public RectangleF R;
        public bool Ellipse;

        public override RectangleF Bounds
        {
            get { RectangleF b = R; b.Inflate(Width / 2f + 2f, Width / 2f + 2f); return b; }
        }

        public override void Draw(Graphics g, float alpha)
        {
            using (var pen = new Pen(Geo.Fade(Color, alpha), Width))
            {
                pen.LineJoin = LineJoin.Round;
                if (Ellipse) g.DrawEllipse(pen, R);
                else g.DrawRectangle(pen, R.X, R.Y, R.Width, R.Height);
            }
        }

        public override bool Hit(PointF p, float radius)
        {
            float r = radius + Width / 2f;
            RectangleF outer = R;
            outer.Inflate(r, r);
            if (!outer.Contains(p)) return false;
            if (!Ellipse)
            {
                PointF a = new PointF(R.Left, R.Top), b = new PointF(R.Right, R.Top), c = new PointF(R.Right, R.Bottom), d = new PointF(R.Left, R.Bottom);
                return Geo.SegDist(p, a, b) <= r || Geo.SegDist(p, b, c) <= r || Geo.SegDist(p, c, d) <= r || Geo.SegDist(p, d, a) <= r;
            }
            float cx = R.X + R.Width / 2f, cy = R.Y + R.Height / 2f, rx = R.Width / 2f, ry = R.Height / 2f;
            PointF prev = new PointF(cx + rx, cy);
            for (int i = 1; i <= 72; i++)
            {
                double t = i * Math.PI * 2 / 72;
                PointF cur = new PointF(cx + rx * (float)Math.Cos(t), cy + ry * (float)Math.Sin(t));
                if (Geo.SegDist(p, prev, cur) <= r) return true;
                prev = cur;
            }
            return false;
        }

        public override void Offset(float dx, float dy) { R.Offset(dx, dy); }
    }

    sealed class TextShape : Shape
    {
        public PointF Pos;
        public string Text;
        public float Size;
        GraphicsPath path;

        GraphicsPath GetPath()
        {
            if (path == null)
            {
                path = new GraphicsPath();
                using (var sf = (StringFormat)StringFormat.GenericTypographic.Clone())
                    path.AddString(Text, Theme.TextFamily, (int)FontStyle.Bold, Size, Pos, sf);
            }
            return path;
        }

        float Outline { get { return Math.Max(2f, Size * 0.13f); } }

        public override RectangleF Bounds
        {
            get { RectangleF b = GetPath().GetBounds(); b.Inflate(Outline + 2f, Outline + 2f); return b; }
        }

        public override void Draw(Graphics g, float alpha)
        {
            // 게임 화면 어디에 써도 읽히도록 반대색 테두리를 두른다.
            Color edge = Geo.IsLight(Color) ? Color.FromArgb(200, 10, 12, 16) : Color.FromArgb(220, 255, 255, 255);
            using (var pen = new Pen(Geo.Fade(edge, alpha), Outline * 2f))
            {
                pen.LineJoin = LineJoin.Round;
                g.DrawPath(pen, GetPath());
            }
            using (var br = new SolidBrush(Geo.Fade(Color, alpha))) g.FillPath(br, GetPath());
        }

        public override bool Hit(PointF p, float radius)
        {
            RectangleF b = Bounds;
            b.Inflate(radius, radius);
            return b.Contains(p);
        }

        public override void Offset(float dx, float dy)
        {
            Pos = new PointF(Pos.X + dx, Pos.Y + dy);
            if (path != null) { path.Dispose(); path = null; }
        }
    }

    // ------------------------------------------------------------------
    // 코치 시그니처 강아지: 프로그램에 들어 있는 그림. ClassPen.bat 옆에 강아지.png 를 두면 그 그림으로 바뀐다.
    // ------------------------------------------------------------------
    static class Mascot
    {
        static Bitmap image;
        static bool loaded;

        public static Bitmap Image
        {
            get
            {
                if (loaded) return image;
                loaded = true;
                string path = Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClassPen"), "signature.png");
                try { if (File.Exists(path)) image = Decode(File.ReadAllBytes(path)); } catch (Exception) { image = null; }
                if (image == null)
                {
                    try { image = Decode(Convert.FromBase64String(MascotData.Png)); } catch (Exception) { image = null; }
                }
                return image;
            }
        }

        static Bitmap Decode(byte[] png)
        {
            using (var ms = new MemoryStream(png))
            using (var src = new Bitmap(ms))
            using (var small = Shrink(src, 512))
                return CropTransparent(small);
        }

        static Bitmap Shrink(Image src, int max)
        {
            float k = Math.Min(1f, max / (float)Math.Max(src.Width, src.Height));
            int w = Math.Max(1, (int)Math.Round(src.Width * k)), h = Math.Max(1, (int)Math.Round(src.Height * k));
            var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(src, new Rectangle(0, 0, w, h));
            }
            return bmp;
        }

        // 누끼 그림 둘레의 투명한 여백을 잘라내야 아이콘·도장이 작아 보이지 않는다.
        static Bitmap CropTransparent(Bitmap src)
        {
            int w = src.Width, h = src.Height, minX = w, minY = h, maxX = -1, maxY = -1;
            BitmapData data = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                var row = new byte[w * 4];
                for (int y = 0; y < h; y++)
                {
                    Marshal.Copy(new IntPtr(data.Scan0.ToInt64() + (long)y * data.Stride), row, 0, row.Length);
                    for (int x = 0; x < w; x++)
                    {
                        if (row[x * 4 + 3] <= 8) continue;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            finally { src.UnlockBits(data); }
            var r = maxX < 0 ? new Rectangle(0, 0, w, h) : Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
            return src.Clone(r, PixelFormat.Format32bppPArgb);
        }

        public static RectangleF Fit(RectangleF box)
        {
            Bitmap img = Image;
            if (img == null) return box;
            float k = Math.Min(box.Width / img.Width, box.Height / img.Height);
            float w = img.Width * k, h = img.Height * k;
            return new RectangleF(box.X + (box.Width - w) / 2f, box.Y + (box.Height - h) / 2f, w, h);
        }

        public static void Draw(Graphics g, RectangleF dest, float alpha)
        {
            Bitmap img = Image;
            if (img == null || alpha <= 0f) return;
            InterpolationMode old = g.InterpolationMode;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            if (alpha >= 1f) g.DrawImage(img, dest);
            else
            {
                using (var attrs = new ImageAttributes())
                {
                    var cm = new ColorMatrix();
                    cm.Matrix33 = alpha;
                    attrs.SetColorMatrix(cm);
                    var pts = new[] { dest.Location, new PointF(dest.Right, dest.Top), new PointF(dest.Left, dest.Bottom) };
                    g.DrawImage(img, pts, new RectangleF(0, 0, img.Width, img.Height), GraphicsUnit.Pixel, attrs);
                }
            }
            g.InterpolationMode = old;
        }
    }

    sealed class StampShape : Shape
    {
        public RectangleF R;

        public override RectangleF Bounds { get { RectangleF b = R; b.Inflate(2f, 2f); return b; } }
        public override void Draw(Graphics g, float alpha) { Mascot.Draw(g, R, alpha); }

        public override bool Hit(PointF p, float radius)
        {
            RectangleF b = R;
            b.Inflate(radius, radius);
            return b.Contains(p);
        }

        public override void Offset(float dx, float dy) { R.Offset(dx, dy); }
    }

    // ------------------------------------------------------------------
    // 설정 저장 (%APPDATA%\ClassPen\settings.ini)
    // ------------------------------------------------------------------
    sealed class Settings
    {
        public int ToolbarX = int.MinValue, ToolbarY = int.MinValue, ColorIndex, WidthIndex = 1;
        public bool Collapsed, HideFromCapture = true, Watermark = true;

        static string FilePath
        {
            get { return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClassPen"), "settings.ini"); }
        }

        public static Settings Load()
        {
            var s = new Settings();
            try
            {
                if (!File.Exists(FilePath)) return s;
                foreach (string line in File.ReadAllLines(FilePath))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string key = line.Substring(0, eq).Trim(), value = line.Substring(eq + 1).Trim();
                    int n;
                    bool isNumber = int.TryParse(value, out n);
                    switch (key)
                    {
                        case "ToolbarX": if (isNumber) s.ToolbarX = n; break;
                        case "ToolbarY": if (isNumber) s.ToolbarY = n; break;
                        case "Color": if (isNumber) s.ColorIndex = n; break;
                        case "Width": if (isNumber) s.WidthIndex = n; break;
                        case "Collapsed": s.Collapsed = value == "1"; break;
                        case "HideFromCapture": s.HideFromCapture = value != "0"; break;
                        case "Watermark": s.Watermark = value != "0"; break;
                    }
                }
            }
            catch (Exception) { }
            return s;
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                File.WriteAllLines(FilePath, new[]
                {
                    "ToolbarX=" + ToolbarX, "ToolbarY=" + ToolbarY, "Color=" + ColorIndex, "Width=" + WidthIndex,
                    "Collapsed=" + (Collapsed ? "1" : "0"), "HideFromCapture=" + (HideFromCapture ? "1" : "0"),
                    "Watermark=" + (Watermark ? "1" : "0")
                });
            }
            catch (Exception) { }
        }
    }

    // ------------------------------------------------------------------
    // 화면 전체를 덮는 투명 그림판
    // ------------------------------------------------------------------
    sealed class Overlay : Form
    {
        public const string ShowMessageName = "ClassPen.ShowToolbar";
        static readonly float[] BaseWidths = { 3f, 6f, 11f };
        static readonly float[] TextSizes = { 22f, 32f, 46f };
        static readonly float[] EraserSizes = { 10f, 18f, 30f };
        static readonly float[] StampSizes = { 90f, 140f, 220f };
        const int LaserHold = 1100, LaserFade = 600, MaxUndo = 100;
        const int HkDraw = 1, HkLaser = 2, HkUndo = 3, HkClear = 4, HkToolbar = 5, HkCapture = 6;

        readonly Settings settings;
        readonly float uiScale;
        readonly int showMessage;
        readonly System.Windows.Forms.Timer renderTimer, topTimer;

        // 그리기 표면: frame 은 화면에 보이는 DIB, baked 는 확정된 그림
        Rectangle screenRect;
        int surfW, surfH;
        IntPtr memDC, dib, oldBitmap, bits;
        Bitmap frame, baked;
        bool indirectOk = true;

        List<Shape> shapes = new List<Shape>();
        readonly List<List<Shape>> undoStack = new List<List<Shape>>();
        readonly List<List<Shape>> redoStack = new List<List<Shape>>();
        readonly List<StrokeShape> lasers = new List<StrokeShape>();
        Shape active;
        PointF dragStart, lastErase, pointer;
        bool pointerInside, erasing, eraseSnapshotTaken, frameDirty;
        Rectangle lastOverlay = Rectangle.Empty, pendingDirty = Rectangle.Empty;
        DateTime lastTextClose = DateTime.MinValue;

        Tool tool = Tool.Mouse, lastDrawTool = Tool.Pen, lastInkTool = Tool.Pen;
        int colorIndex, widthIndex;
        Board board = Board.None;
        bool inkHidden;

        Toolbar toolbar;
        Toast toast;
        NotifyIcon tray;
        TextEntry textEntry;
        Cursor customCursor;
        IntPtr previousForeground;

        public Overlay()
        {
            settings = Settings.Load();
            colorIndex = Geo.Clamp(settings.ColorIndex, 0, Theme.Palette.Length - 1);
            widthIndex = Geo.Clamp(settings.WidthIndex, 0, BaseWidths.Length - 1);
            uiScale = Native.SystemScale();
            showMessage = Native.RegisterWindowMessage(ShowMessageName);

            Text = "ClassPen";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            ImeMode = ImeMode.Disable;
            screenRect = SystemInformation.VirtualScreen;
            Bounds = screenRect;

            renderTimer = new System.Windows.Forms.Timer();
            renderTimer.Interval = 10;
            renderTimer.Tick += OnRenderTick;
            topTimer = new System.Windows.Forms.Timer();
            topTimer.Interval = 1500;
            topTimer.Tick += delegate { KeepOnTop(); };
        }

        // ---- 상태 (툴바에서 읽음) ----
        public Tool CurrentTool { get { return tool; } }
        public bool IsDrawing { get { return tool != Tool.Mouse; } }
        public int ColorIndex { get { return colorIndex; } }
        public int WidthIndex { get { return widthIndex; } }
        public Color CurrentColor { get { return Theme.Palette[colorIndex]; } }
        public Board CurrentBoard { get { return board; } }
        public bool InkHidden { get { return inkHidden; } }
        public bool CanUndo { get { return undoStack.Count > 0; } }
        public bool CanRedo { get { return redoStack.Count > 0; } }

        float StrokeWidth(Tool t)
        {
            float w = BaseWidths[widthIndex] * uiScale;
            if (t == Tool.Highlighter) return w * 3.2f;
            if (t == Tool.Laser) return w * 1.2f;
            return w;
        }

        float TextSize { get { return TextSizes[widthIndex] * uiScale; } }
        float EraserRadius { get { return EraserSizes[widthIndex] * uiScale; } }

        RectangleF StampRect(PointF center)
        {
            float h = StampSizes[widthIndex] * uiScale;
            return Mascot.Fit(new RectangleF(center.X - h, center.Y - h / 2f, h * 2f, h));
        }

        bool ShowStampPreview { get { return tool == Tool.Stamp && pointerInside && Mascot.Image != null; } }

        // ---- 창 설정 ----
        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                // TopMost 속성 대신 스타일로 '항상 위'를 건다. (TopMost 속성은 창을 띄울 때 포커스를 뺏는다)
                cp.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TOOLWINDOW | Native.WS_EX_TOPMOST;
                if (!IsDrawing) cp.ExStyle |= Native.WS_EX_TRANSPARENT; // 마우스 모드: 클릭이 아래 창으로 통과
                return cp;
            }
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override void OnPaintBackground(PaintEventArgs e) { }
        protected override void OnPaint(PaintEventArgs e) { }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.DisableTabletGestures(Handle);
            CreateSurface();
            RebuildAndPresent();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            toast = new Toast();
            toast.Owner = this;
            toast.HideFromCapture = settings.HideFromCapture;
            toolbar = new Toolbar(this);
            toolbar.Owner = this;
            toolbar.PlaceInitially(settings.ToolbarX, settings.ToolbarY, settings.Collapsed);
            toolbar.Show();
            toolbar.ApplyCaptureExclusion(settings.HideFromCapture);
            toolbar.RefreshState();
            CreateTray();
            SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
            topTimer.Start();
            RefreshCursor();
            RegisterHotkeys();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            CloseTextEntry();
            if (toolbar != null)
            {
                settings.ToolbarX = toolbar.Left;
                settings.ToolbarY = toolbar.Top;
                settings.Collapsed = toolbar.Collapsed;
            }
            settings.ColorIndex = colorIndex;
            settings.WidthIndex = widthIndex;
            settings.Save();
            for (int id = HkDraw; id <= HkCapture; id++) Native.UnregisterHotKey(Handle, id);
            SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
            renderTimer.Stop();
            topTimer.Stop();
            if (tray != null) { tray.Visible = false; tray.Dispose(); tray = null; }
            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            DestroySurface();
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == Native.WM_HOTKEY) { OnHotkey(m.WParam.ToInt32()); return; }
            if (showMessage != 0 && m.Msg == showMessage)
            {
                if (toolbar != null) { toolbar.Show(); toolbar.EnsureOnScreen(); }
                ShowToast("ClassPen 이 이미 켜져 있어요");
                return;
            }
            if (m.Msg == Native.WM_DPICHANGED) { m.Result = IntPtr.Zero; return; } // 항상 가상 화면 전체를 덮도록 크기를 유지
            base.WndProc(ref m);
        }

        void KeepOnTop()
        {
            // 다른 '항상 위' 창(게임 오버레이 등)에 가려지지 않도록 주기적으로 맨 위로 올린다.
            const uint flags = Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE;
            Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, flags);
            if (toolbar != null && toolbar.Visible) Native.SetWindowPos(toolbar.Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, flags);
        }

        void SetClickThrough(bool on)
        {
            if (!IsHandleCreated) return;
            int ex = Native.GetWindowLong(Handle, Native.GWL_EXSTYLE);
            int next = on ? (ex | Native.WS_EX_TRANSPARENT) : (ex & ~Native.WS_EX_TRANSPARENT);
            if (next != ex) Native.SetWindowLong(Handle, Native.GWL_EXSTYLE, next);
        }

        void OnDisplaySettingsChanged(object sender, EventArgs e)
        {
            if (IsDisposed || !IsHandleCreated) return;
            BeginInvoke((MethodInvoker)delegate
            {
                Rectangle vs = SystemInformation.VirtualScreen;
                if (vs == screenRect || vs.Width <= 0 || vs.Height <= 0) return;
                FinishActive();
                ClearLasers();
                // 모니터 배치가 바뀌어 화면 원점이 움직여도 그림은 같은 자리에 남도록 옮긴다.
                OffsetAllShapes(screenRect.X - vs.X, screenRect.Y - vs.Y);
                screenRect = vs;
                CreateSurface();
                RebuildAndPresent();
                if (toolbar != null) toolbar.EnsureOnScreen();
            });
        }

        void OffsetAllShapes(float dx, float dy)
        {
            if (dx == 0f && dy == 0f) return;
            var seen = new Dictionary<Shape, bool>();
            var lists = new List<List<Shape>>();
            lists.Add(shapes);
            lists.AddRange(undoStack);
            lists.AddRange(redoStack);
            foreach (List<Shape> list in lists)
                foreach (Shape s in list)
                    if (!seen.ContainsKey(s)) { seen[s] = true; s.Offset(dx, dy); }
        }

        // ---- 단축키 ----
        void RegisterHotkeys()
        {
            var failed = new List<string>();
            RegisterHotkey(HkDraw, Keys.D, failed);
            RegisterHotkey(HkLaser, Keys.L, failed);
            RegisterHotkey(HkUndo, Keys.Z, failed);
            RegisterHotkey(HkClear, Keys.C, failed);
            RegisterHotkey(HkToolbar, Keys.H, failed);
            RegisterHotkey(HkCapture, Keys.S, failed);
            if (failed.Count > 0)
                ShowToast("다른 프로그램이 이미 쓰고 있어서 꺼진 단축키:\n" + string.Join(", ", failed.ToArray()), 5000);
        }

        void RegisterHotkey(int id, Keys key, List<string> failed)
        {
            if (!Native.RegisterHotKey(Handle, id, Native.MOD_CONTROL | Native.MOD_ALT | Native.MOD_NOREPEAT, (int)key))
                failed.Add("Ctrl+Alt+" + key);
        }

        void OnHotkey(int id)
        {
            switch (id)
            {
                case HkDraw:
                    ToggleDraw();
                    ShowToast(IsDrawing ? "그리기 모드" : "마우스 모드 (그림은 그대로)", 900);
                    break;
                case HkLaser:
                    SetTool(tool == Tool.Laser ? Tool.Mouse : Tool.Laser);
                    ShowToast(tool == Tool.Laser ? "레이저 펜" : "마우스 모드 (그림은 그대로)", 900);
                    break;
                case HkUndo: Undo(); break;
                case HkClear: ClearAll(); break;
                case HkToolbar: ToggleToolbar(); break;
                case HkCapture: CaptureScreen(); break;
            }
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (!IsDrawing) return; // 마우스 모드에서는 키 입력에 반응하지 않는다
            Keys key = Native.RealKey(Handle, e.KeyCode);
            if (e.Control && !e.Alt)
            {
                if (key == Keys.Z) { if (e.Shift) Redo(); else Undo(); e.Handled = true; }
                else if (key == Keys.Y) { Redo(); e.Handled = true; }
                return;
            }
            if (e.Control || e.Alt) return;
            switch (key)
            {
                case Keys.Escape: SetTool(Tool.Mouse); break;
                case Keys.P: SetTool(Tool.Pen); break;
                case Keys.H: SetTool(Tool.Highlighter); break;
                case Keys.L: SetTool(Tool.Laser); break;
                case Keys.I: SetTool(Tool.Line); break;
                case Keys.A: SetTool(Tool.Arrow); break;
                case Keys.R: SetTool(Tool.Rect); break;
                case Keys.O: SetTool(Tool.Ellipse); break;
                case Keys.T: SetTool(Tool.Text); break;
                case Keys.E: SetTool(Tool.Eraser); break;
                case Keys.S: if (Mascot.Image != null) SetTool(Tool.Stamp); break;
                case Keys.B: CycleBoard(); break;
                case Keys.Delete: ClearAll(); break;
                case Keys.OemOpenBrackets: SetWidth(widthIndex - 1); break;
                case Keys.OemCloseBrackets: SetWidth(widthIndex + 1); break;
                default:
                    int n = -1;
                    if (key >= Keys.D1 && key <= Keys.D8) n = key - Keys.D1;
                    else if (key >= Keys.NumPad1 && key <= Keys.NumPad8) n = key - Keys.NumPad1;
                    if (n >= 0) SetColor(n);
                    break;
            }
        }

        // ---- 도구/설정 변경 ----
        public void SetTool(Tool t)
        {
            CloseTextEntry();
            FinishActive();
            bool wasDrawing = IsDrawing, wasHidden = inkHidden;
            if (t != Tool.Mouse)
            {
                lastDrawTool = t;
                inkHidden = false;
                if (t != Tool.Eraser && t != Tool.Stamp) lastInkTool = t;
            }
            tool = t;
            erasing = false;
            SetClickThrough(!IsDrawing);
            if (wasDrawing != IsDrawing || wasHidden != inkHidden) RebuildAndPresent();
            else RequestFrame();
            RefreshCursor();
            RefreshUi();
            if (!wasDrawing && IsDrawing) TakeFocus();
            else if (wasDrawing && !IsDrawing) GiveBackFocus();
        }

        // 그리기 모드에 들어가면 키보드 단축키(Esc, P, H...)가 바로 먹도록 포커스를 가져오고,
        // 나올 때는 보던 창(게임, 영상)에 포커스를 돌려준다.
        void TakeFocus()
        {
            if (!IsHandleCreated) return;
            IntPtr fg = Native.GetForegroundWindow();
            if (!Native.IsOwnWindow(fg)) previousForeground = fg;
            Native.SetForegroundWindow(Handle);
        }

        void GiveBackFocus()
        {
            IntPtr prev = previousForeground;
            previousForeground = IntPtr.Zero;
            if (prev != IntPtr.Zero && Native.IsOwnWindow(Native.GetForegroundWindow()))
                Native.SetForegroundWindow(prev);
        }

        public void ToggleDraw() { SetTool(IsDrawing ? Tool.Mouse : lastDrawTool); }

        public void SetColor(int index)
        {
            colorIndex = Geo.Clamp(index, 0, Theme.Palette.Length - 1);
            // 색을 고르면 바로 그릴 수 있게 마지막 그리기 도구로 돌아간다.
            if (tool == Tool.Mouse || tool == Tool.Eraser || tool == Tool.Stamp) SetTool(lastInkTool);
            RefreshCursor();
            RefreshUi();
        }

        public void SetWidth(int index)
        {
            widthIndex = Geo.Clamp(index, 0, BaseWidths.Length - 1);
            RefreshCursor();
            RequestFrame();
            RefreshUi();
        }

        public void CycleBoard()
        {
            board = (Board)(((int)board + 1) % 3);
            if (board == Board.White && colorIndex == Theme.WhiteIndex) colorIndex = Theme.BlackIndex;
            if (board == Board.Black && colorIndex == Theme.BlackIndex) colorIndex = Theme.WhiteIndex;
            if (board != Board.None && !IsDrawing) SetTool(lastInkTool);
            RebuildAndPresent();
            RefreshCursor();
            RefreshUi();
        }

        public void ToggleInk()
        {
            CloseTextEntry();
            FinishActive();
            inkHidden = !inkHidden;
            if (inkHidden && IsDrawing)
            {
                tool = Tool.Mouse;
                SetClickThrough(true);
                RefreshCursor();
                GiveBackFocus();
            }
            ClearLasers();
            RebuildAndPresent();
            RefreshUi();
            ShowToast(inkHidden ? "그림 숨김 — 다시 누르면 보여요" : "그림 다시 보이기", 1200);
        }

        public void ToggleToolbar()
        {
            if (toolbar == null) return;
            if (toolbar.Visible)
            {
                toolbar.Hide();
                ShowToast("툴바 숨김 — Ctrl+Alt+H 또는 트레이 아이콘으로 다시 보기", 1800);
            }
            else
            {
                toolbar.Show();
                toolbar.EnsureOnScreen();
            }
        }

        void RefreshUi() { if (toolbar != null) toolbar.RefreshState(); }

        public void ShowToast(string text, int ms = 1800)
        {
            if (toast == null) return;
            if (toolbar != null && toolbar.Visible) toast.ShowMessage(text, ms, toolbar.Bounds, true, toolbar.UiScale);
            else toast.ShowMessage(text, ms, Screen.FromPoint(Cursor.Position).WorkingArea, false, uiScale);
        }

        // ---- 실행 취소 / 지우기 ----
        void PushUndo()
        {
            undoStack.Add(new List<Shape>(shapes));
            if (undoStack.Count > MaxUndo) undoStack.RemoveAt(0);
            redoStack.Clear();
        }

        public void Undo()
        {
            CloseTextEntry();
            FinishActive();
            if (undoStack.Count == 0) return;
            redoStack.Add(shapes);
            shapes = undoStack[undoStack.Count - 1];
            undoStack.RemoveAt(undoStack.Count - 1);
            RebuildAndPresent();
            RefreshUi();
        }

        public void Redo()
        {
            CloseTextEntry();
            FinishActive();
            if (redoStack.Count == 0) return;
            undoStack.Add(shapes);
            shapes = redoStack[redoStack.Count - 1];
            redoStack.RemoveAt(redoStack.Count - 1);
            RebuildAndPresent();
            RefreshUi();
        }

        public void ClearAll()
        {
            CloseTextEntry();
            active = null;
            if (shapes.Count > 0)
            {
                PushUndo();
                shapes = new List<Shape>();
            }
            ClearLasers();
            RebuildAndPresent();
            RefreshUi();
        }

        void ClearLasers()
        {
            foreach (StrokeShape l in lasers) l.Release();
            lasers.Clear();
        }

        void Commit(Shape s)
        {
            PushUndo();
            shapes.Add(s);
            using (Graphics g = Graphics.FromImage(baked))
            {
                Geo.Prep(g);
                if (!inkHidden) s.Draw(g, 1f);
            }
            // 마지막 프레임 이후에 늘어난 부분까지 화면에 반영되도록 도형 전체 영역을 갱신한다.
            pendingDirty = Geo.Union(pendingDirty, Geo.Outer(s.Bounds));
            RequestFrame();
            RefreshUi();
        }

        public void AddText(PointF screenPt, string text, Color color, float size)
        {
            lastTextClose = DateTime.UtcNow;
            if (text == null || text.Trim().Length == 0) return;
            var s = new TextShape();
            s.Pos = new PointF(screenPt.X - screenRect.X, screenPt.Y - screenRect.Y);
            s.Text = text.TrimEnd();
            s.Size = size;
            s.Color = color;
            Commit(s);
        }

        void EraseAlong(PointF a, PointF b)
        {
            float r = EraserRadius;
            int steps = Math.Max(1, (int)Math.Ceiling(Geo.Dist(a, b) / Math.Max(2f, r * 0.5f)));
            var keep = new List<Shape>(shapes.Count);
            bool any = false;
            foreach (Shape s in shapes)
            {
                bool hit = false;
                for (int k = 0; k <= steps && !hit; k++)
                {
                    float t = k / (float)steps;
                    hit = s.Hit(new PointF(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t), r);
                }
                if (hit) any = true; else keep.Add(s);
            }
            if (!any) return;
            if (!eraseSnapshotTaken) { PushUndo(); eraseSnapshotTaken = true; }
            shapes = keep;
            RebuildAndPresent();
            RefreshUi();
        }

        // ---- 마우스 ----
        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (!IsDrawing || inkHidden || e.Button != MouseButtons.Left) return;
            PointF p = e.Location;
            switch (tool)
            {
                case Tool.Pen:
                case Tool.Highlighter:
                case Tool.Laser:
                    var st = new StrokeShape();
                    st.Kind = tool == Tool.Pen ? StrokeKind.Pen : (tool == Tool.Highlighter ? StrokeKind.Highlighter : StrokeKind.Laser);
                    st.Color = CurrentColor;
                    st.Width = StrokeWidth(tool);
                    st.Add(p);
                    active = st;
                    break;
                case Tool.Line:
                case Tool.Arrow:
                    var ln = new LineShape();
                    ln.A = p; ln.B = p; ln.Arrow = tool == Tool.Arrow;
                    ln.Color = CurrentColor;
                    ln.Width = StrokeWidth(tool);
                    active = ln;
                    break;
                case Tool.Rect:
                case Tool.Ellipse:
                    var box = new BoxShape();
                    box.R = new RectangleF(p, SizeF.Empty);
                    box.Ellipse = tool == Tool.Ellipse;
                    box.Color = CurrentColor;
                    box.Width = StrokeWidth(tool);
                    dragStart = p;
                    active = box;
                    break;
                case Tool.Text:
                    // 글상자 밖을 눌러 입력을 끝낸 클릭이면 새 글상자를 열지 않는다.
                    if ((DateTime.UtcNow - lastTextClose).TotalMilliseconds > 350) OpenTextEntry(e.Location);
                    break;
                case Tool.Eraser:
                    erasing = true;
                    eraseSnapshotTaken = false;
                    lastErase = p;
                    EraseAlong(p, p);
                    break;
                case Tool.Stamp:
                    if (Mascot.Image != null)
                    {
                        var stamp = new StampShape();
                        stamp.R = StampRect(p);
                        Commit(stamp);
                    }
                    break;
            }
            RequestFrame();
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            PointF p = e.Location;
            pointer = p;
            pointerInside = true;
            bool shift = (ModifierKeys & Keys.Shift) == Keys.Shift;
            var st = active as StrokeShape;
            var ln = active as LineShape;
            var box = active as BoxShape;
            if (st != null) st.Add(p);
            else if (ln != null) ln.B = shift ? Geo.Snap45(ln.A, p) : p;
            else if (box != null) box.R = Geo.BoxFrom(dragStart, p, shift);
            else if (erasing) { EraseAlong(lastErase, p); lastErase = p; }
            if (active != null || tool == Tool.Eraser || tool == Tool.Stamp) RequestFrame();
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (e.Button != MouseButtons.Left) return;
            erasing = false;
            EndStroke();
        }

        protected override void OnMouseCaptureChanged(EventArgs e)
        {
            base.OnMouseCaptureChanged(e);
            erasing = false;
            EndStroke();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            pointerInside = false;
            RequestFrame();
        }

        void FinishActive() { EndStroke(); }

        void EndStroke()
        {
            Shape s = active;
            active = null;
            if (s == null) return;
            var st = s as StrokeShape;
            if (st != null && st.Kind == StrokeKind.Laser)
            {
                st.Released = true;
                st.ReleasedAt = Environment.TickCount;
                lasers.Add(st);
                RequestFrame();
                return;
            }
            var ln = s as LineShape;
            var box = s as BoxShape;
            bool keep = true;
            if (ln != null) keep = Geo.Dist(ln.A, ln.B) >= 4f;
            if (box != null) keep = box.R.Width >= 4f || box.R.Height >= 4f;
            if (keep) Commit(s);
            else RequestFrame();
        }

        // ---- 글자 입력 ----
        void OpenTextEntry(Point clientPt)
        {
            CloseTextEntry();
            var screenPt = new Point(clientPt.X + screenRect.X, clientPt.Y + screenRect.Y);
            textEntry = new TextEntry(this, screenPt, CurrentColor, TextSize, uiScale);
            textEntry.Owner = this;
            textEntry.Show();
        }

        void CloseTextEntry()
        {
            if (textEntry == null) return;
            if (!textEntry.IsDisposed) textEntry.Finish(true);
            textEntry = null;
        }

        // ---- 커서 ----
        void RefreshCursor()
        {
            Cursor next;
            switch (tool)
            {
                case Tool.Pen:
                case Tool.Laser:
                    next = MakeDotCursor(CurrentColor, Math.Max(6f, StrokeWidth(tool)));
                    break;
                case Tool.Highlighter:
                    next = MakeDotCursor(Geo.Fade(CurrentColor, 0.6f), Math.Max(6f, StrokeWidth(tool)));
                    break;
                case Tool.Eraser:
                    next = MakeDotCursor(Color.White, 5f);
                    break;
                case Tool.Text:
                    next = Cursors.IBeam;
                    break;
                case Tool.Mouse:
                    next = Cursors.Default;
                    break;
                default:
                    next = Cursors.Cross;
                    break;
            }
            Cursor old = customCursor;
            customCursor = (next == Cursors.IBeam || next == Cursors.Default || next == Cursors.Cross) ? null : next;
            Cursor = next;
            if (old != null) Native.DestroyCursor(old.Handle);
        }

        static Cursor MakeDotCursor(Color fill, float diameter)
        {
            int size = Math.Max(32, (int)Math.Ceiling(diameter) + 8);
            if (size % 2 == 1) size++;
            float d = Math.Min(diameter, size - 4);
            using (var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    float o = (size - d) / 2f;
                    using (var b = new SolidBrush(fill)) g.FillEllipse(b, o, o, d, d);
                    Color edge = Geo.IsLight(fill) ? Color.FromArgb(200, 0, 0, 0) : Color.FromArgb(220, 255, 255, 255);
                    using (var p = new Pen(edge, 1.2f)) g.DrawEllipse(p, o, o, d, d);
                }
                IntPtr hIcon = bmp.GetHicon();
                Native.ICONINFO info;
                Native.GetIconInfo(hIcon, out info);
                info.fIcon = false;
                info.xHotspot = size / 2;
                info.yHotspot = size / 2;
                IntPtr hCursor = Native.CreateIconIndirect(ref info);
                if (info.hbmColor != IntPtr.Zero) Native.DeleteObject(info.hbmColor);
                if (info.hbmMask != IntPtr.Zero) Native.DeleteObject(info.hbmMask);
                Native.DestroyIcon(hIcon);
                return hCursor == IntPtr.Zero ? Cursors.Cross : new Cursor(hCursor);
            }
        }

        // ---- 화면 캡처 ----
        public void CaptureScreen()
        {
            CloseTextEntry();
            FinishActive();
            Rectangle sb = Screen.FromPoint(Cursor.Position).Bounds;
            bool hideToolbar = toolbar != null && toolbar.Visible && !toolbar.ExcludedFromCapture;
            try
            {
                using (var shot = new Bitmap(sb.Width, sb.Height, PixelFormat.Format32bppArgb))
                {
                    using (Graphics g = Graphics.FromImage(shot))
                    {
                        if (board == Board.None)
                        {
                            // 화면만 깨끗하게 찍은 뒤 그림을 그 위에 다시 그린다.
                            if (toast != null) toast.Hide();
                            if (hideToolbar) toolbar.Hide();
                            Present(Rectangle.Empty, 0);
                            Native.WaitForCompositor();
                            try { g.CopyFromScreen(sb.Location, Point.Empty, sb.Size); }
                            finally
                            {
                                Present(Rectangle.Empty, 255);
                                if (hideToolbar) toolbar.Show();
                            }
                        }
                        else g.Clear(BoardColor());
                        Geo.Prep(g);
                        g.TranslateTransform(screenRect.X - sb.X, screenRect.Y - sb.Y);
                        if (!inkHidden) foreach (Shape s in shapes) s.Draw(g, 1f);
                        if (settings.Watermark && Mascot.Image != null)
                        {
                            // 학생에게 보내는 캡처에 코치 시그니처 강아지를 오른쪽 아래에 넣는다.
                            g.ResetTransform();
                            float h = shot.Height * 0.12f, margin = 16f * uiScale;
                            RectangleF wm = Mascot.Fit(new RectangleF(shot.Width - margin - h * 2f, shot.Height - margin - h, h * 2f, h));
                            wm.X = shot.Width - margin - wm.Width;
                            Mascot.Draw(g, wm, 0.92f);
                        }
                    }
                    string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "ClassPen");
                    Directory.CreateDirectory(dir);
                    string stamp = "ClassPen_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
                    string file = Path.Combine(dir, stamp + ".png");
                    for (int i = 2; File.Exists(file); i++) file = Path.Combine(dir, stamp + "_" + i + ".png");
                    shot.Save(file, ImageFormat.Png);
                    bool copied = true;
                    try { Clipboard.SetImage(shot); } catch (Exception) { copied = false; }
                    ShowToast(copied ? "캡처 완료 — 클립보드에 복사됐어요 (Ctrl+V)\n사진 폴더 > ClassPen 에도 저장" : "캡처 저장: " + file, 2600);
                }
            }
            catch (Exception ex)
            {
                ShowToast("캡처 실패: " + ex.Message, 3000);
            }
        }

        // ---- 트레이 아이콘 ----
        void CreateTray()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("툴바 보이기 / 숨기기   (Ctrl+Alt+H)", null, delegate { ToggleToolbar(); });
            menu.Items.Add("그리기 ↔ 마우스   (Ctrl+Alt+D)", null, delegate { ToggleDraw(); });
            var hideItem = new ToolStripMenuItem("화면 공유·녹화에 툴바 안 보이기");
            hideItem.Checked = settings.HideFromCapture;
            hideItem.Click += delegate
            {
                settings.HideFromCapture = !settings.HideFromCapture;
                hideItem.Checked = settings.HideFromCapture;
                toolbar.ApplyCaptureExclusion(settings.HideFromCapture);
                toast.HideFromCapture = settings.HideFromCapture;
            };
            menu.Items.Add(hideItem);
            if (Mascot.Image != null)
            {
                var markItem = new ToolStripMenuItem("캡처에 강아지 넣기");
                markItem.Checked = settings.Watermark;
                markItem.Click += delegate
                {
                    settings.Watermark = !settings.Watermark;
                    markItem.Checked = settings.Watermark;
                };
                menu.Items.Add(markItem);
            }
            menu.Items.Add("단축키 보기", null, delegate { ShowHelp(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("종료", null, delegate { Close(); });
            tray = new NotifyIcon();
            tray.Icon = AppIcon.Make();
            tray.Text = "ClassPen 판서 도구";
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { ToggleToolbar(); };
            tray.Visible = true;
        }

        public void ShowHelp()
        {
            const string help =
                "[어디서나 쓰는 단축키]\n" +
                "Ctrl+Alt+D   그리기 ↔ 마우스\n" +
                "Ctrl+Alt+L   레이저 펜 (잠시 후 저절로 사라짐)\n" +
                "Ctrl+Alt+Z   실행 취소\n" +
                "Ctrl+Alt+C   전체 지우기\n" +
                "Ctrl+Alt+H   툴바 숨기기 / 보이기\n" +
                "Ctrl+Alt+S   화면 캡처 (클립보드 + 사진 폴더)\n\n" +
                "[그리는 중 단축키]\n" +
                "P 펜 · H 형광펜 · L 레이저 · I 직선 · A 화살표\n" +
                "R 사각형 · O 원 · T 텍스트 · E 지우개 · S 강아지 도장 · Esc 마우스\n" +
                "1~8 색 · [ ] 굵기 · B 보드 · Delete 전체 지우기\n" +
                "Ctrl+Z 실행 취소 · Ctrl+Y 다시 실행\n" +
                "Shift 누르고 그리기: 45° 직선 · 정사각형 · 정원";
            IWin32Window owner = toolbar != null && toolbar.Visible ? (IWin32Window)toolbar : this;
            MessageBox.Show(owner, help, "ClassPen 단축키");
        }

        // ---- 그리기 표면 ----
        void CreateSurface()
        {
            DestroySurface();
            surfW = Math.Max(1, screenRect.Width);
            surfH = Math.Max(1, screenRect.Height);
            var bmi = new Native.BITMAPINFOHEADER();
            bmi.biSize = Marshal.SizeOf(typeof(Native.BITMAPINFOHEADER));
            bmi.biWidth = surfW;
            bmi.biHeight = -surfH; // 위에서 아래로
            bmi.biPlanes = 1;
            bmi.biBitCount = 32;
            memDC = Native.CreateCompatibleDC(IntPtr.Zero);
            dib = Native.CreateDIBSection(memDC, ref bmi, 0, out bits, IntPtr.Zero, 0);
            if (dib == IntPtr.Zero) throw new OutOfMemoryException("화면 크기만큼 메모리를 잡지 못했어요.");
            oldBitmap = Native.SelectObject(memDC, dib);
            frame = new Bitmap(surfW, surfH, surfW * 4, PixelFormat.Format32bppPArgb, bits);
            baked = new Bitmap(surfW, surfH, PixelFormat.Format32bppPArgb);
            lastOverlay = Rectangle.Empty;
            pendingDirty = Rectangle.Empty;
            indirectOk = true;
        }

        void DestroySurface()
        {
            if (frame != null) { frame.Dispose(); frame = null; }
            if (baked != null) { baked.Dispose(); baked = null; }
            if (memDC != IntPtr.Zero)
            {
                Native.SelectObject(memDC, oldBitmap);
                Native.DeleteObject(dib);
                Native.DeleteDC(memDC);
                memDC = IntPtr.Zero;
                dib = IntPtr.Zero;
            }
        }

        Color BoardColor()
        {
            return board == Board.White ? Color.FromArgb(250, 250, 248) : Color.FromArgb(21, 23, 29);
        }

        Color BackgroundColor()
        {
            if (inkHidden) return Color.Transparent;
            if (board != Board.None) return BoardColor();
            // 그리기 모드에서는 거의 투명한(1/255) 바탕을 깔아야 마우스 클릭을 받을 수 있다.
            return IsDrawing ? Color.FromArgb(1, 0, 0, 0) : Color.Transparent;
        }

        void Bake()
        {
            using (Graphics g = Graphics.FromImage(baked))
            {
                g.CompositingMode = CompositingMode.SourceCopy;
                g.Clear(BackgroundColor());
                g.CompositingMode = CompositingMode.SourceOver;
                Geo.Prep(g);
                if (!inkHidden) foreach (Shape s in shapes) s.Draw(g, 1f);
            }
        }

        void CopyBaked(Rectangle r)
        {
            BitmapData data = baked.LockBits(r, ImageLockMode.ReadOnly, PixelFormat.Format32bppPArgb);
            try
            {
                long stride = (long)surfW * 4;
                var rowBytes = new IntPtr(r.Width * 4);
                for (int y = 0; y < r.Height; y++)
                {
                    var src = new IntPtr(data.Scan0.ToInt64() + (long)y * data.Stride);
                    var dst = new IntPtr(bits.ToInt64() + (r.Y + y) * stride + (long)r.X * 4);
                    Native.CopyMemory(dst, src, rowBytes);
                }
            }
            finally { baked.UnlockBits(data); }
        }

        void RebuildAndPresent()
        {
            if (frame == null) return;
            Bake();
            var all = new Rectangle(0, 0, surfW, surfH);
            CopyBaked(all);
            Rectangle cur = OverlayBounds();
            if (!Geo.IsEmpty(cur)) DrawOverlays(cur);
            lastOverlay = cur;
            pendingDirty = Rectangle.Empty;
            frameDirty = false;
            Present(Rectangle.Empty, 255);
        }

        void RequestFrame()
        {
            frameDirty = true;
            if (!renderTimer.Enabled) renderTimer.Start();
        }

        void OnRenderTick(object sender, EventArgs e)
        {
            int now = Environment.TickCount;
            bool fading = false, removed = false;
            for (int i = lasers.Count - 1; i >= 0; i--)
            {
                float a = LaserAlpha(lasers[i], now);
                if (a <= 0f) { lasers[i].Release(); lasers.RemoveAt(i); removed = true; }
                else if (a < 1f) fading = true;
            }
            if (frameDirty || fading || removed)
            {
                frameDirty = false;
                RenderFrame();
            }
            if (!frameDirty && lasers.Count == 0) renderTimer.Stop();
        }

        static float LaserAlpha(StrokeShape s, int now)
        {
            if (!s.Released) return 1f;
            int t = unchecked(now - s.ReleasedAt);
            if (t <= LaserHold) return 1f;
            return 1f - (t - LaserHold) / (float)LaserFade;
        }

        // 바뀐 부분만 다시 그려서 큰 화면/듀얼 모니터에서도 부드럽게 유지한다.
        void RenderFrame()
        {
            if (frame == null) return;
            Rectangle cur = OverlayBounds();
            Rectangle dirty = Geo.Union(Geo.Union(lastOverlay, cur), pendingDirty);
            dirty.Intersect(new Rectangle(0, 0, surfW, surfH));
            lastOverlay = cur;
            pendingDirty = Rectangle.Empty;
            if (Geo.IsEmpty(dirty)) return;
            CopyBaked(dirty);
            DrawOverlays(dirty);
            Present(dirty, 255);
        }

        Rectangle OverlayBounds()
        {
            RectangleF r = RectangleF.Empty;
            bool any = false;
            if (active != null) Accumulate(ref r, ref any, active.Bounds);
            foreach (StrokeShape l in lasers) Accumulate(ref r, ref any, l.Bounds);
            if (tool == Tool.Eraser && pointerInside)
            {
                float er = EraserRadius + 3f;
                Accumulate(ref r, ref any, new RectangleF(pointer.X - er, pointer.Y - er, er * 2f, er * 2f));
            }
            if (ShowStampPreview)
            {
                RectangleF sr = StampRect(pointer);
                sr.Inflate(2f, 2f);
                Accumulate(ref r, ref any, sr);
            }
            if (!any) return Rectangle.Empty;
            Rectangle ri = Geo.Outer(r);
            ri.Intersect(new Rectangle(0, 0, surfW, surfH));
            return ri;
        }

        static void Accumulate(ref RectangleF acc, ref bool any, RectangleF r)
        {
            if (r.Width <= 0 && r.Height <= 0) return;
            acc = any ? RectangleF.Union(acc, r) : r;
            any = true;
        }

        void DrawOverlays(Rectangle clip)
        {
            using (Graphics g = Graphics.FromImage(frame))
            {
                g.SetClip(clip);
                Geo.Prep(g);
                if (active != null) active.Draw(g, 1f);
                int now = Environment.TickCount;
                foreach (StrokeShape l in lasers) l.Draw(g, LaserAlpha(l, now));
                if (tool == Tool.Eraser && pointerInside)
                {
                    float er = EraserRadius;
                    using (var p1 = new Pen(Color.FromArgb(160, 0, 0, 0), 3f)) g.DrawEllipse(p1, pointer.X - er, pointer.Y - er, er * 2f, er * 2f);
                    using (var p2 = new Pen(Color.FromArgb(235, 255, 255, 255), 1.5f)) g.DrawEllipse(p2, pointer.X - er, pointer.Y - er, er * 2f, er * 2f);
                }
                if (ShowStampPreview) Mascot.Draw(g, StampRect(pointer), 0.5f); // 찍힐 자리 미리보기
            }
        }

        unsafe void Present(Rectangle dirty, byte alpha)
        {
            if (frame == null || !IsHandleCreated) return;
            Native.GdiFlush();
            var ptDst = new Native.POINT(screenRect.X, screenRect.Y);
            var size = new Native.SIZE(surfW, surfH);
            var ptSrc = new Native.POINT(0, 0);
            var blend = new Native.BLENDFUNCTION();
            blend.SourceConstantAlpha = alpha;
            blend.AlphaFormat = 1; // AC_SRC_ALPHA
            if (!Geo.IsEmpty(dirty) && indirectOk)
            {
                var rc = new Native.RECT();
                rc.Left = dirty.Left; rc.Top = dirty.Top; rc.Right = dirty.Right; rc.Bottom = dirty.Bottom;
                var info = new Native.ULWINFO();
                info.cbSize = Marshal.SizeOf(typeof(Native.ULWINFO));
                info.pptDst = (IntPtr)(&ptDst);
                info.psize = (IntPtr)(&size);
                info.hdcSrc = memDC;
                info.pptSrc = (IntPtr)(&ptSrc);
                info.pblend = (IntPtr)(&blend);
                info.dwFlags = Native.ULW_ALPHA;
                info.prcDirty = (IntPtr)(&rc);
                if (Native.UpdateLayeredWindowIndirect(Handle, ref info)) return;
                indirectOk = false; // 지원 안 하면 이후로는 전체 갱신
            }
            Native.UpdateLayeredWindow(Handle, IntPtr.Zero, ref ptDst, ref size, memDC, ref ptSrc, 0, ref blend, Native.ULW_ALPHA);
        }
    }

    // ------------------------------------------------------------------
    // 떠 있는 툴바
    // ------------------------------------------------------------------
    enum IconKind { None, Mouse, Pen, Highlighter, Laser, Line, Arrow, Rect, Ellipse, Text, Eraser, Stamp, Undo, Redo, Trash, Board, Eye, EyeOff, Camera, ChevronUp, ChevronDown, Close }

    sealed class Toolbar : Form
    {
        static readonly Tool[] ToolOrder = { Tool.Mouse, Tool.Pen, Tool.Highlighter, Tool.Laser, Tool.Line, Tool.Arrow, Tool.Rect, Tool.Ellipse, Tool.Text, Tool.Eraser, Tool.Stamp };
        static readonly string[] ToolTips =
        {
            "마우스 (Esc)\n그림은 그대로 두고 클릭은 아래 화면으로",
            "펜 (P)",
            "형광펜 (H)",
            "레이저 펜 (L · 어디서나 Ctrl+Alt+L)\n그리고 나면 잠시 후 저절로 사라져요",
            "직선 (I)\nShift: 45° 고정",
            "화살표 (A)\nShift: 45° 고정",
            "사각형 (R)\nShift: 정사각형",
            "원 (O)\nShift: 정원",
            "텍스트 (T)\nEnter 완료 · Shift+Enter 줄바꿈 · Esc 취소",
            "지우개 (E)\n닿은 획을 통째로 지워요",
            "강아지 도장 (S)\n누른 곳에 시그니처 강아지를 찍어요 · 크기는 굵기 버튼으로"
        };

        readonly Overlay app;
        readonly ToolTip tip;
        readonly List<TbButton> toolButtons = new List<TbButton>();
        readonly List<Tool> tools = new List<Tool>();
        readonly List<TbButton> colorButtons = new List<TbButton>();
        readonly List<TbButton> widthButtons = new List<TbButton>();
        readonly TbButton undoButton, redoButton, clearButton, boardButton, inkButton, captureButton, collapseButton, closeButton, modeButton;
        float scale = 1f;
        bool collapsed, dragging, excludedFromCapture;
        int sep1 = -1, sep2 = -1;
        Point dragOffset;

        public Toolbar(Overlay app)
        {
            this.app = app;
            Text = "ClassPen";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Theme.Surface;
            DoubleBuffered = true;
            Cursor = Cursors.SizeAll;
            tip = new ToolTip();
            tip.ShowAlways = true;
            tip.InitialDelay = 350;
            tip.ReshowDelay = 100;
            tip.AutoPopDelay = 8000;

            for (int i = 0; i < ToolOrder.Length; i++)
            {
                Tool t = ToolOrder[i];
                if (t == Tool.Stamp && Mascot.Image == null) continue; // 강아지 그림이 있을 때만 도장 버튼
                tools.Add(t);
                toolButtons.Add(AddButton(IconFor(t), ToolTips[i], delegate { app.SetTool(t); }));
            }
            for (int i = 0; i < Theme.Palette.Length; i++)
            {
                int index = i;
                TbButton b = AddButton(IconKind.None, "색: " + Theme.PaletteNames[i] + " (" + (i + 1) + ")", delegate { app.SetColor(index); });
                b.IsSwatch = true;
                b.Swatch = Theme.Palette[i];
                colorButtons.Add(b);
            }
            string[] widthNames = { "가늘게 ([)", "보통", "굵게 (])" };
            float[] dots = { 4f, 7f, 11f };
            for (int i = 0; i < widthNames.Length; i++)
            {
                int index = i;
                TbButton b = AddButton(IconKind.None, "굵기: " + widthNames[i], delegate { app.SetWidth(index); });
                b.Dot = dots[i];
                widthButtons.Add(b);
            }
            undoButton = AddButton(IconKind.Undo, "실행 취소 (Ctrl+Z · 어디서나 Ctrl+Alt+Z)", delegate { app.Undo(); });
            redoButton = AddButton(IconKind.Redo, "다시 실행 (Ctrl+Y)", delegate { app.Redo(); });
            clearButton = AddButton(IconKind.Trash, "전체 지우기 (Delete · 어디서나 Ctrl+Alt+C)", delegate { app.ClearAll(); });
            boardButton = AddButton(IconKind.Board, "보드 (B)\n투명 → 화이트보드 → 블랙보드", delegate { app.CycleBoard(); });
            inkButton = AddButton(IconKind.Eye, "그림 잠깐 숨기기 / 다시 보이기", delegate { app.ToggleInk(); });
            captureButton = AddButton(IconKind.Camera, "화면 캡처 (Ctrl+Alt+S)\n클립보드 복사 + 사진 폴더 > ClassPen 저장", delegate { app.CaptureScreen(); });
            collapseButton = AddButton(IconKind.ChevronUp, "툴바 접기 / 펼치기", delegate { Collapsed = !collapsed; });
            closeButton = AddButton(IconKind.Close, "ClassPen 끄기", delegate { app.BeginInvoke((MethodInvoker)app.Close); });
            modeButton = AddButton(IconKind.Mouse, "그리기 ↔ 마우스 (Ctrl+Alt+D)", delegate { app.ToggleDraw(); });
            collapseButton.Small = true;
            closeButton.Small = true;
            tip.SetToolTip(this, "끌어서 옮기기 · 더블클릭으로 접기");
        }

        public float UiScale { get { return scale; } }
        public bool ExcludedFromCapture { get { return excludedFromCapture; } }

        public bool Collapsed
        {
            get { return collapsed; }
            set
            {
                if (collapsed == value) return;
                collapsed = value;
                LayoutButtons();
                RefreshState();
                ClampToScreen();
            }
        }

        static IconKind IconFor(Tool t)
        {
            switch (t)
            {
                case Tool.Pen: return IconKind.Pen;
                case Tool.Highlighter: return IconKind.Highlighter;
                case Tool.Laser: return IconKind.Laser;
                case Tool.Line: return IconKind.Line;
                case Tool.Arrow: return IconKind.Arrow;
                case Tool.Rect: return IconKind.Rect;
                case Tool.Ellipse: return IconKind.Ellipse;
                case Tool.Text: return IconKind.Text;
                case Tool.Eraser: return IconKind.Eraser;
                case Tool.Stamp: return IconKind.Stamp;
                default: return IconKind.Mouse;
            }
        }

        TbButton AddButton(IconKind icon, string tooltip, Action onClick)
        {
            var b = new TbButton(this);
            b.Icon = icon;
            b.ClickAction = onClick;
            Controls.Add(b);
            tip.SetToolTip(b, tooltip);
            return b;
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | Native.WS_EX_TOPMOST;
                return cp;
            }
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Alt+F4 등으로 툴바만 닫히지 않게 숨기기로 바꾼다. (끄기는 × 버튼이나 트레이 메뉴)
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); return; }
            base.OnFormClosing(e);
        }

        protected override void WndProc(ref Message m)
        {
            // 툴바를 눌러도 보고 있던 창(게임, 영상)의 포커스를 뺏지 않는다.
            if (m.Msg == Native.WM_MOUSEACTIVATE) { m.Result = (IntPtr)Native.MA_NOACTIVATE; return; }
            if (m.Msg == Native.WM_DPICHANGED)
            {
                float next = (m.WParam.ToInt64() & 0xFFFF) / 96f;
                if (next > 0f && Math.Abs(next - scale) > 0.01f)
                {
                    float ratio = next / scale;
                    dragOffset = new Point((int)(dragOffset.X * ratio), (int)(dragOffset.Y * ratio));
                    ApplyScale(next);
                }
                m.Result = IntPtr.Zero;
                return;
            }
            base.WndProc(ref m);
        }

        public void ApplyScale(float s)
        {
            scale = s;
            LayoutButtons();
        }

        int S(float v) { return (int)Math.Round(v * scale); }

        public void PlaceInitially(int x, int y, bool collapsedState)
        {
            collapsed = collapsedState;
            var want = new Point(x, y);
            bool valid = x != int.MinValue && y != int.MinValue && OnSomeScreen(new Rectangle(want, new Size(40, 40)));
            Rectangle wa = valid ? Screen.FromPoint(want).WorkingArea : Screen.PrimaryScreen.WorkingArea;
            Location = valid ? want : new Point(wa.Left + 16, wa.Top + 16);
            IntPtr handle = Handle; // 창을 먼저 만들어야 그 모니터의 배율을 알 수 있다
            ApplyScale(Native.WindowScale(handle));
            if (!valid) Location = new Point(wa.Left + S(14), wa.Top + Math.Max(0, (wa.Height - Height) / 2));
            ClampToScreen();
        }

        protected override void OnVisibleChanged(EventArgs e)
        {
            base.OnVisibleChanged(e);
            if (!Visible || !IsHandleCreated) return;
            float s = Native.WindowScale(Handle);
            if (Math.Abs(s - scale) > 0.01f) ApplyScale(s);
        }

        public void ApplyCaptureExclusion(bool exclude)
        {
            excludedFromCapture = Native.ExcludeFromCapture(Handle, exclude);
        }

        static bool OnSomeScreen(Rectangle r)
        {
            foreach (Screen s in Screen.AllScreens)
                if (s.WorkingArea.IntersectsWith(r)) return true;
            return false;
        }

        public void EnsureOnScreen()
        {
            if (OnSomeScreen(Bounds)) { ClampToScreen(); return; }
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            Location = new Point(wa.Left + S(14), wa.Top + Math.Max(0, (wa.Height - Height) / 2));
        }

        void ClampToScreen()
        {
            Rectangle wa = Screen.FromRectangle(Bounds).WorkingArea;
            int x = Math.Max(wa.Left, Math.Min(Left, wa.Right - Width));
            int y = Math.Max(wa.Top, Math.Min(Top, wa.Bottom - Height));
            if (x != Left || y != Top) Location = new Point(x, y);
        }

        void LayoutButtons()
        {
            SuspendLayout();
            int pad = S(8), cell = S(36), gap = S(4), row = S(28), header = S(Mascot.Image != null ? 32 : 22), small = S(20);
            int contentW = cell * 2 + gap;
            int y = pad;
            closeButton.Bounds = new Rectangle(pad + contentW - small, y + (header - small) / 2, small, small);
            collapseButton.Bounds = new Rectangle(closeButton.Left - small - S(2), closeButton.Top, small, small);
            y += header + S(6);

            bool full = !collapsed;
            foreach (TbButton b in toolButtons) b.Visible = full;
            foreach (TbButton b in colorButtons) b.Visible = full;
            foreach (TbButton b in widthButtons) b.Visible = full;
            TbButton[] actions = { undoButton, redoButton, clearButton, boardButton, inkButton, captureButton };
            foreach (TbButton b in actions) b.Visible = full;
            modeButton.Visible = collapsed;
            sep1 = sep2 = -1;

            if (collapsed)
            {
                modeButton.Bounds = new Rectangle(pad, y, contentW, cell);
                y += cell;
            }
            else
            {
                for (int i = 0; i < toolButtons.Count; i++)
                    toolButtons[i].Bounds = new Rectangle(pad + (i % 2) * (cell + gap), y + (i / 2) * (cell + gap), cell, cell);
                int toolRows = (toolButtons.Count + 1) / 2;
                y += toolRows * cell + (toolRows - 1) * gap;
                sep1 = y + S(6);
                y += S(13);
                for (int i = 0; i < colorButtons.Count; i++)
                    colorButtons[i].Bounds = new Rectangle(pad + (i % 2) * (cell + gap), y + (i / 2) * (row + gap), cell, row);
                y += 4 * row + 4 * gap;
                int bw = (contentW - 2 * gap) / 3;
                for (int i = 0; i < widthButtons.Count; i++)
                    widthButtons[i].Bounds = new Rectangle(pad + i * (bw + gap), y, i == 2 ? contentW - 2 * (bw + gap) : bw, row);
                y += row;
                sep2 = y + S(6);
                y += S(13);
                for (int i = 0; i < actions.Length; i++)
                    actions[i].Bounds = new Rectangle(pad + (i % 2) * (cell + gap), y + (i / 2) * (cell + gap), cell, cell);
                y += 3 * cell + 2 * gap;
            }
            y += pad;
            Size = new Size(contentW + pad * 2, y);
            ApplyRegion();
            ResumeLayout();
            Invalidate(true);
        }

        void ApplyRegion()
        {
            using (var path = Geo.RoundRect(new RectangleF(0f, 0f, Width, Height), S(6)))
            {
                Region old = Region;
                Region = new Region(path);
                if (old != null) old.Dispose();
            }
        }

        public void RefreshState()
        {
            for (int i = 0; i < toolButtons.Count; i++)
            {
                toolButtons[i].Checked = tools[i] == app.CurrentTool;
                toolButtons[i].Swatch = app.CurrentColor;
            }
            for (int i = 0; i < colorButtons.Count; i++) colorButtons[i].Checked = i == app.ColorIndex;
            for (int i = 0; i < widthButtons.Count; i++) widthButtons[i].Checked = i == app.WidthIndex;
            undoButton.Dimmed = !app.CanUndo;
            redoButton.Dimmed = !app.CanRedo;
            boardButton.BoardState = app.CurrentBoard;
            boardButton.Checked = app.CurrentBoard != Board.None;
            inkButton.Icon = app.InkHidden ? IconKind.EyeOff : IconKind.Eye;
            inkButton.Checked = app.InkHidden;
            collapseButton.Icon = collapsed ? IconKind.ChevronDown : IconKind.ChevronUp;
            modeButton.Icon = app.IsDrawing ? IconFor(app.CurrentTool) : IconKind.Mouse;
            modeButton.Checked = app.IsDrawing;
            modeButton.Swatch = app.CurrentColor;
            foreach (Control c in Controls) c.Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            PaintChrome(e.Graphics);
        }

        public void PaintChrome(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var path = Geo.RoundRect(new RectangleF(0.5f, 0.5f, Width - 2f, Height - 2f), S(6)))
            using (var pen = new Pen(Theme.Border, 1f))
                g.DrawPath(pen, path);
            if (Mascot.Image != null)
            {
                // 머리 부분에 코치 시그니처 강아지 (빈 곳이라 끌어서 옮기기도 그대로 된다)
                Mascot.Draw(g, Mascot.Fit(new RectangleF(S(10), S(8), collapseButton.Left - S(14), S(32))), 1f);
            }
            else
            {
                using (var b = new SolidBrush(Theme.Dim))
                {
                    float d = 3f * scale, x0 = S(14), y0 = S(8) + S(11);
                    for (int i = 0; i < 3; i++)
                        for (int j = 0; j < 2; j++)
                            g.FillEllipse(b, x0 + i * 5f * scale - d / 2f, y0 + (j - 0.5f) * 5f * scale - d / 2f, d, d);
                }
            }
            using (var pen = new Pen(Theme.Border, Math.Max(1f, scale)))
            {
                if (sep1 >= 0) g.DrawLine(pen, S(12), sep1, Width - S(12), sep1);
                if (sep2 >= 0) g.DrawLine(pen, S(12), sep2, Width - S(12), sep2);
            }
        }

        // 빈 곳을 끌면 툴바가 움직인다.
        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left) { dragging = true; dragOffset = e.Location; }
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            if (!dragging) return;
            Point p = Cursor.Position;
            Location = new Point(p.X - dragOffset.X, p.Y - dragOffset.Y);
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            if (!dragging) return;
            dragging = false;
            ClampToScreen();
        }

        protected override void OnMouseDoubleClick(MouseEventArgs e)
        {
            base.OnMouseDoubleClick(e);
            if (e.Button == MouseButtons.Left) Collapsed = !collapsed;
        }
    }

    sealed class TbButton : Control
    {
        readonly Toolbar bar;
        public IconKind Icon;
        public Action ClickAction;
        public bool Checked, Dimmed, IsSwatch, Small;
        public Color Swatch = Color.White;
        public float Dot;
        public Board BoardState;
        bool hover, pressed;

        public TbButton(Toolbar bar)
        {
            this.bar = bar;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
            SetStyle(ControlStyles.Selectable, false);
            TabStop = false;
            Cursor = Cursors.Default;
        }

        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); hover = true; Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hover = false; pressed = false; Invalidate(); }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left) { pressed = true; Invalidate(); }
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            bool fire = pressed && e.Button == MouseButtons.Left && ClientRectangle.Contains(e.Location);
            pressed = false;
            Invalidate();
            if (fire && ClickAction != null) ClickAction();
        }

        protected override void OnPaint(PaintEventArgs e) { PaintFace(e.Graphics, ClientRectangle, bar.UiScale); }

        public void PaintFace(Graphics g, Rectangle rc, float s)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var sb = new SolidBrush(Theme.Surface)) g.FillRectangle(sb, rc);
            bool checkedLook = Checked && !IsSwatch;
            Color bg = pressed ? Theme.Pressed : (hover ? Theme.Hover : Theme.Surface);
            if (checkedLook) bg = hover ? Theme.CheckedHover : Theme.Checked;
            var r = new RectangleF(rc.X + 0.5f, rc.Y + 0.5f, rc.Width - 1f, rc.Height - 1f);
            using (var path = Geo.RoundRect(r, 7f * s))
            using (var b = new SolidBrush(bg))
                g.FillPath(b, path);
            if (checkedLook)
            {
                RectangleF inner = r;
                inner.Inflate(-0.75f * s, -0.75f * s);
                using (var path = Geo.RoundRect(inner, 6.5f * s))
                using (var p = new Pen(Theme.Accent, 1.5f * s))
                    g.DrawPath(p, path);
            }
            float cx = rc.X + rc.Width / 2f, cy = rc.Y + rc.Height / 2f;
            if (IsSwatch)
            {
                float d = Math.Min(rc.Width, rc.Height) * 0.62f;
                if (Checked)
                    using (var p = new Pen(Theme.Text, 2f * s))
                        g.DrawEllipse(p, cx - d / 2f - 3f * s, cy - d / 2f - 3f * s, d + 6f * s, d + 6f * s);
                using (var b = new SolidBrush(Swatch)) g.FillEllipse(b, cx - d / 2f, cy - d / 2f, d, d);
                using (var p = new Pen(Color.FromArgb(70, 255, 255, 255), 1f)) g.DrawEllipse(p, cx - d / 2f, cy - d / 2f, d, d);
                return;
            }
            if (Dot > 0f)
            {
                float d = Dot * s;
                using (var b = new SolidBrush(Checked ? Color.White : Theme.Icon)) g.FillEllipse(b, cx - d / 2f, cy - d / 2f, d, d);
                return;
            }
            Color fg = Dimmed ? Theme.Dim : (checkedLook ? Color.White : Theme.Icon);
            float box = (Small ? 14f : 20f) * s;
            Icons.Draw(g, Icon, new RectangleF(cx - box / 2f, cy - box / 2f, box, box), fg, Swatch, BoardState, Small ? 2.2f : 1.6f);
        }
    }

    // 아이콘은 이미지 파일 없이 20x20 좌표계에 직접 그린다.
    static class Icons
    {
        static PointF P(float x, float y) { return new PointF(x, y); }

        public static void Draw(Graphics g, IconKind k, RectangleF box, Color fg, Color accent, Board board, float weight)
        {
            if (k == IconKind.None) return;
            GraphicsState state = g.Save();
            g.TranslateTransform(box.X, box.Y);
            float s = box.Width / 20f;
            g.ScaleTransform(s, s);
            using (var pen = new Pen(fg, weight))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;
                switch (k)
                {
                    case IconKind.Mouse:
                        g.DrawPolygon(pen, new[] { P(5.5f, 2.5f), P(5.5f, 16.5f), P(9f, 13.2f), P(11.4f, 18.2f), P(13.6f, 17.2f), P(11.3f, 12.4f), P(16f, 12.4f) });
                        break;
                    case IconKind.Pen:
                    {
                        GraphicsState inner = g.Save();
                        g.TranslateTransform(10.5f, 9.5f);
                        g.RotateTransform(45f);
                        g.DrawPolygon(pen, new[] { P(-2.6f, -8.5f), P(2.6f, -8.5f), P(2.6f, 3.5f), P(0f, 8f), P(-2.6f, 3.5f) });
                        g.DrawLine(pen, -2.6f, -5.2f, 2.6f, -5.2f);
                        using (var tipBrush = new SolidBrush(accent)) g.FillPolygon(tipBrush, new[] { P(-1.3f, 5.2f), P(1.3f, 5.2f), P(0f, 7.6f) });
                        g.Restore(inner);
                        break;
                    }
                    case IconKind.Highlighter:
                    {
                        using (var mark = new Pen(Color.FromArgb(170, accent), 3.4f)) g.DrawLine(mark, 2.5f, 17.6f, 11.5f, 17.6f);
                        GraphicsState inner = g.Save();
                        g.TranslateTransform(12f, 8.5f);
                        g.RotateTransform(45f);
                        g.DrawPolygon(pen, new[] { P(-3.2f, -7f), P(3.2f, -7f), P(3.2f, 1.5f), P(1.8f, 4f), P(1.8f, 6.6f), P(-1.8f, 5.2f), P(-1.8f, 4f), P(-3.2f, 1.5f) });
                        g.Restore(inner);
                        break;
                    }
                    case IconKind.Laser:
                        using (var b1 = new SolidBrush(Color.FromArgb(80, fg))) g.FillEllipse(b1, 2.6f, 14.4f, 3f, 3f);
                        using (var b2 = new SolidBrush(Color.FromArgb(150, fg))) g.FillEllipse(b2, 6f, 10.6f, 3.6f, 3.6f);
                        using (var glow = new SolidBrush(Color.FromArgb(90, accent))) g.FillEllipse(glow, 9.4f, 2.4f, 9.2f, 9.2f);
                        using (var dot = new SolidBrush(accent)) g.FillEllipse(dot, 11.5f, 4.5f, 5f, 5f);
                        using (var ring = new Pen(fg, 1f)) g.DrawEllipse(ring, 11.5f, 4.5f, 5f, 5f);
                        break;
                    case IconKind.Line:
                        g.DrawLine(pen, 4.5f, 15.5f, 15.5f, 4.5f);
                        using (var b = new SolidBrush(fg))
                        {
                            g.FillEllipse(b, 2.8f, 13.8f, 3.4f, 3.4f);
                            g.FillEllipse(b, 13.8f, 2.8f, 3.4f, 3.4f);
                        }
                        break;
                    case IconKind.Arrow:
                        g.DrawLine(pen, 4.5f, 15.5f, 15f, 5f);
                        g.DrawLines(pen, new[] { P(8.6f, 5f), P(15f, 5f), P(15f, 11.4f) });
                        break;
                    case IconKind.Rect:
                        g.DrawRectangle(pen, 3.5f, 5f, 13f, 10f);
                        break;
                    case IconKind.Ellipse:
                        g.DrawEllipse(pen, 3f, 4.5f, 14f, 11f);
                        break;
                    case IconKind.Text:
                        using (var tp = new Pen(fg, weight + 0.4f))
                        {
                            tp.StartCap = LineCap.Round;
                            tp.EndCap = LineCap.Round;
                            g.DrawLine(tp, 4.5f, 4.5f, 15.5f, 4.5f);
                            g.DrawLine(tp, 10f, 4.5f, 10f, 16f);
                        }
                        g.DrawLine(pen, 7.5f, 16f, 12.5f, 16f);
                        break;
                    case IconKind.Eraser:
                    {
                        GraphicsState inner = g.Save();
                        g.TranslateTransform(10.5f, 9f);
                        g.RotateTransform(-40f);
                        using (var rubber = new SolidBrush(Color.FromArgb(90, fg))) g.FillRectangle(rubber, -7.5f, -3.8f, 6.5f, 7.6f);
                        using (var body = Geo.RoundRect(new RectangleF(-7.5f, -3.8f, 15f, 7.6f), 1.6f)) g.DrawPath(pen, body);
                        g.DrawLine(pen, -1f, -3.8f, -1f, 3.8f);
                        g.Restore(inner);
                        g.DrawLine(pen, 3.5f, 17.5f, 16.5f, 17.5f);
                        break;
                    }
                    case IconKind.Undo:
                    case IconKind.Redo:
                    {
                        GraphicsState inner = g.Save();
                        if (k == IconKind.Redo) { g.TranslateTransform(20f, 0f); g.ScaleTransform(-1f, 1f); }
                        g.DrawBezier(pen, P(15.5f, 16f), P(15.5f, 10f), P(12f, 7.5f), P(5f, 7.5f));
                        g.DrawLines(pen, new[] { P(8.6f, 3.9f), P(5f, 7.5f), P(8.6f, 11.1f) });
                        g.Restore(inner);
                        break;
                    }
                    case IconKind.Trash:
                        g.DrawLine(pen, 3.5f, 5.5f, 16.5f, 5.5f);
                        g.DrawLines(pen, new[] { P(8f, 5.5f), P(8f, 3.2f), P(12f, 3.2f), P(12f, 5.5f) });
                        g.DrawLines(pen, new[] { P(5.2f, 5.5f), P(6.2f, 17f), P(13.8f, 17f), P(14.8f, 5.5f) });
                        g.DrawLine(pen, 8.6f, 8.8f, 8.8f, 14.2f);
                        g.DrawLine(pen, 11.4f, 8.8f, 11.2f, 14.2f);
                        break;
                    case IconKind.Board:
                    {
                        var r = new RectangleF(3f, 3.5f, 14f, 10f);
                        if (board != Board.None)
                        {
                            using (var b = new SolidBrush(board == Board.White ? Color.White : Color.FromArgb(21, 23, 29))) g.FillRectangle(b, r);
                        }
                        g.DrawRectangle(pen, r.X, r.Y, r.Width, r.Height);
                        g.DrawLine(pen, 7f, 13.5f, 5.5f, 17.5f);
                        g.DrawLine(pen, 13f, 13.5f, 14.5f, 17.5f);
                        break;
                    }
                    case IconKind.Eye:
                    case IconKind.EyeOff:
                        using (var eye = new GraphicsPath())
                        {
                            eye.AddBezier(P(2f, 10f), P(5.5f, 4.2f), P(14.5f, 4.2f), P(18f, 10f));
                            eye.AddBezier(P(18f, 10f), P(14.5f, 15.8f), P(5.5f, 15.8f), P(2f, 10f));
                            eye.CloseFigure();
                            g.DrawPath(pen, eye);
                        }
                        g.DrawEllipse(pen, 7.4f, 7.4f, 5.2f, 5.2f);
                        if (k == IconKind.EyeOff) g.DrawLine(pen, 4f, 16.5f, 16f, 3.5f);
                        break;
                    case IconKind.Camera:
                        using (var body = Geo.RoundRect(new RectangleF(2.5f, 6.5f, 15f, 10.5f), 2f)) g.DrawPath(pen, body);
                        g.DrawLines(pen, new[] { P(6.8f, 6.5f), P(8f, 4.3f), P(12f, 4.3f), P(13.2f, 6.5f) });
                        g.DrawEllipse(pen, 7f, 8.7f, 6f, 6f);
                        break;
                    case IconKind.ChevronUp:
                        g.DrawLines(pen, new[] { P(5f, 12.5f), P(10f, 7.5f), P(15f, 12.5f) });
                        break;
                    case IconKind.ChevronDown:
                        g.DrawLines(pen, new[] { P(5f, 7.5f), P(10f, 12.5f), P(15f, 7.5f) });
                        break;
                    case IconKind.Stamp:
                        if (Mascot.Image != null) Mascot.Draw(g, Mascot.Fit(new RectangleF(0f, 0f, 20f, 20f)), 1f);
                        else
                        {
                            using (var paw = new SolidBrush(fg))
                            {
                                g.FillEllipse(paw, 6f, 10f, 8f, 7f);
                                g.FillEllipse(paw, 3f, 6.5f, 3.4f, 3.8f);
                                g.FillEllipse(paw, 7f, 3.5f, 3.4f, 3.8f);
                                g.FillEllipse(paw, 11f, 3.5f, 3.4f, 3.8f);
                                g.FillEllipse(paw, 14.4f, 6.5f, 3.4f, 3.8f);
                            }
                        }
                        break;
                    case IconKind.Close:
                        g.DrawLine(pen, 5.5f, 5.5f, 14.5f, 14.5f);
                        g.DrawLine(pen, 14.5f, 5.5f, 5.5f, 14.5f);
                        break;
                }
            }
            g.Restore(state);
        }
    }

    static class AppIcon
    {
        public static Icon Make()
        {
            using (var bmp = new Bitmap(32, 32, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    if (Mascot.Image != null)
                        Mascot.Draw(g, Mascot.Fit(new RectangleF(0f, 0f, 32f, 32f)), 1f); // 트레이 아이콘도 시그니처 강아지
                    else
                    {
                        using (var path = Geo.RoundRect(new RectangleF(1f, 1f, 30f, 30f), 7f))
                        using (var b = new SolidBrush(Theme.Accent))
                            g.FillPath(b, path);
                        Icons.Draw(g, IconKind.Pen, new RectangleF(5f, 5f, 22f, 22f), Color.White, Color.White, Board.None, 2.2f);
                    }
                }
                return Icon.FromHandle(bmp.GetHicon()); // 프로그램이 끝날 때까지 쓰는 아이콘
            }
        }
    }

    // ------------------------------------------------------------------
    // 잠깐 떴다 사라지는 알림
    // ------------------------------------------------------------------
    sealed class Toast : Form
    {
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        string message = "";
        float scale = 1f;
        Font font;
        bool hideFromCapture;

        public Toast()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            BackColor = Theme.Surface;
            DoubleBuffered = true;
            timer.Tick += delegate { timer.Stop(); Hide(); };
        }

        public bool HideFromCapture
        {
            get { return hideFromCapture; }
            set { hideFromCapture = value; if (IsHandleCreated) Native.ExcludeFromCapture(Handle, value); }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | Native.WS_EX_TOPMOST;
                return cp;
            }
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); return; }
            base.OnFormClosing(e);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            if (hideFromCapture) Native.ExcludeFromCapture(Handle, true);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == Native.WM_MOUSEACTIVATE) { m.Result = (IntPtr)Native.MA_NOACTIVATE; return; }
            base.WndProc(ref m);
        }

        int Pad { get { return (int)Math.Round(12 * scale); } }
        int Bar { get { return Math.Max(3, (int)Math.Round(4 * scale)); } }

        public void ShowMessage(string text, int ms, Rectangle anchor, bool besideAnchor, float s)
        {
            message = text;
            if (font == null || Math.Abs(s - scale) > 0.01f)
            {
                if (font != null) font.Dispose();
                font = new Font(Theme.TextFamily, 13f * s, FontStyle.Bold, GraphicsUnit.Pixel);
            }
            scale = s;
            Size textSize = TextRenderer.MeasureText(text, font);
            Size = new Size(textSize.Width + Pad * 2 + Bar, textSize.Height + Pad * 2 - (int)(4 * s));
            if (besideAnchor)
            {
                Rectangle wa = Screen.FromRectangle(anchor).WorkingArea;
                int x = anchor.Right + (int)(8 * s);
                if (x + Width > wa.Right) x = anchor.Left - (int)(8 * s) - Width;
                int y = Math.Max(wa.Top, Math.Min(anchor.Top, wa.Bottom - Height));
                Location = new Point(x, y);
            }
            else
            {
                Location = new Point(anchor.Left + (anchor.Width - Width) / 2, anchor.Bottom - Height - (int)(56 * s));
            }
            if (!Visible) Show();
            Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
            Invalidate();
            timer.Stop();
            timer.Interval = Math.Max(400, ms);
            timer.Start();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            using (var b = new SolidBrush(Theme.Accent)) g.FillRectangle(b, 0, 0, Bar, Height);
            using (var p = new Pen(Theme.Border)) g.DrawRectangle(p, 0, 0, Width - 1, Height - 1);
            var area = new Rectangle(Bar + Pad, Pad - (int)(2 * scale), Width - Bar - Pad * 2 + 4, Height);
            TextRenderer.DrawText(g, message, font, area, Theme.Text, TextFormatFlags.Left | TextFormatFlags.Top | TextFormatFlags.NoPrefix);
        }
    }

    // ------------------------------------------------------------------
    // 텍스트 도구 입력 상자 (한글 입력기 그대로 사용)
    // ------------------------------------------------------------------
    sealed class TextEntry : Form
    {
        readonly Overlay app;
        readonly TextBox box;
        readonly Color color;
        readonly float size;
        readonly int pad;
        bool finished;

        public TextEntry(Overlay app, Point screenPt, Color color, float size, float s)
        {
            this.app = app;
            this.color = color;
            this.size = size;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.None;
            TopMost = true;
            BackColor = Geo.IsLight(color) ? Color.FromArgb(24, 27, 36) : Color.FromArgb(246, 246, 246);
            pad = Math.Max(3, (int)Math.Round(4 * s));

            box = new TextBox();
            box.Multiline = true;
            box.AcceptsReturn = true;
            box.WordWrap = false;
            box.ScrollBars = ScrollBars.None;
            box.BorderStyle = BorderStyle.None;
            box.Font = new Font(Theme.TextFamily, size, FontStyle.Bold, GraphicsUnit.Pixel);
            box.ForeColor = color;
            box.BackColor = BackColor;
            box.ImeMode = ImeMode.Hangul; // 그림판이 입력기를 꺼 두므로 글상자에서는 한글로 시작

            box.Location = new Point(pad, pad);
            box.KeyDown += OnBoxKeyDown;
            box.TextChanged += delegate { FitToText(); };
            Controls.Add(box);
            FitToText();
            Location = new Point(screenPt.X - pad, screenPt.Y - pad - box.Font.Height / 2);
        }

        void FitToText()
        {
            string t = box.Text.Length == 0 ? "가나다" : box.Text;
            if (t.EndsWith("\n")) t += "가";
            Size sz = TextRenderer.MeasureText(t, box.Font, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPrefix);
            box.Size = new Size(sz.Width + box.Font.Height / 2, sz.Height + 2);
            ClientSize = new Size(box.Width + pad * 2, box.Height + pad * 2);
        }

        void OnBoxKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter && !e.Shift) { e.SuppressKeyPress = true; Finish(true); }
            else if (e.KeyCode == Keys.Escape) { e.SuppressKeyPress = true; Finish(false); }
        }

        public void Finish(bool commit)
        {
            if (finished) return;
            finished = true;
            app.AddText(new PointF(Left + box.Left, Top + box.Top), commit ? box.Text : "", color, size);
            if (IsHandleCreated) BeginInvoke((MethodInvoker)delegate { if (!IsDisposed) Close(); });
            else Close();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Activate();
            box.Focus();
        }

        protected override void OnDeactivate(EventArgs e)
        {
            base.OnDeactivate(e);
            Finish(true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using (var p = new Pen(Color.FromArgb(220, color), 1.5f))
            {
                p.DashStyle = DashStyle.Dash;
                e.Graphics.DrawRectangle(p, 1, 1, Width - 3, Height - 3);
            }
        }
    }
    // 코치 시그니처 강아지 그림 (PNG, base64). 바꾸려면 ClassPen.bat 옆에 강아지.png 를 두면 그 그림이 우선한다.
    static class MascotData
    {
        public const string Png = @"
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
nDlzhrIsCymltXXrtk+dP3/uA2bJ++e5lIlbb73VPnToUPat3/qtM9PT070nn3xy2vHc/9u2rB1hr+/s3ru79thjXx7VGRBZWZalVErhuY7avW1WTI6OsN5s
c92BfWybmeTM8gZPv/waSRQxWq2wbXaam6691tB8C3bv2EU37PDFrzzNxeVVMkryJNVeQr2IsnSaXZW3ve2tjI2NvHT62Mm/+8yLL748OAcuUw5aA/HIN+LA
+Ys86vKvs23/rgNnT5z+mTvvvHPn9NS0tbqyXL70+mEVpmm51mzKx5/6KvValamJCUbGJ3jssccZG6+zfX4ex7a5uLio5VKuR6FKiryg0dik2+sRxykTE1NU
qhWmJiYYHx/n4sJFvvSVJ/n473+OXrfDt/6N99NotTl7/iLNdpPHn/wqTx96lRNnzyullFCKIstz6QdBeOeddxyenpx8ptPt/uhTzz/f+oG/9/cfXVhcen2Y
gvKX8yhAnDx+cuHMmTMXglrgB7VK7rtekuTZ/sNHjhFGsQ7WiWLOLixzYXGFu990O3feebsZH+jZbFHqW6NWZpRGxqlMapVl0r2M6cQejOMysiI3QSo5URQj
pI1fCYadgBo6XeWl2EOUiQXUqhk9s45ReakprkLfXvM0oki1brzIUoo01che1zPtszQLW3O7lo65yRd63FRk5japhnGGedQzslLLhJsPnMbya3g/Qggzq89M
/rM1xDeUeW5yjI2ctSwokhgpoEwT8jjE8gNTjEqNqcgyEmM6TKNoOP5RpR7vSMsejqsGZO0ShbRskigmTaKh3FYgNJs+y4adWRhF5KnOpO52e0bKq0iTRP9/
rgukdExhMD9LZWJNpeOA1BnXjWaDKC/AsgnjmCiJOb+4wuLqBkmWY9s6FB4pteHJdDUCmJma5Mar93PzwQPsmJ9jbtusXhCvrLG6vsmZCxfZbDSHN8k8z+l0
u0PTpjUY+dnarZ7nuUE/X4qkHPzspZTEcUKv2yPN8gF2W+zbt0cWRfE7n/3sZ3sPPvigfOKJJ/7MI9nl5eUSEMeOHesfOnQo39jYaL391tt+f+uuud9bWW8c
smzrg1tmtxyKorCWJHGglFL1elVZli2X1htFlBcsrK5z9PQ5cWFxmfVGk0arjW07tHr9cnl9o3zl2AleO3qC10+cEk8fepnzSytFrx+WUZIqSqVcxwWJ9BxX
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";
    }
}
