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
        public const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x8000000;
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
    enum Tool { Mouse, Pen, Highlighter, Laser, Line, Arrow, Rect, Ellipse, Text, Eraser }
    enum Board { None, White, Black }
    enum StrokeKind { Pen, Highlighter, Laser }

    abstract class Shape
    {
        public Color Color;
        public float Width;
        public abstract RectangleF Bounds { get; }
        public abstract void Draw(Graphics g, float alpha);
        public abstract bool Hit(PointF p, float radius);
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
    }

    // ------------------------------------------------------------------
    // 설정 저장 (%APPDATA%\ClassPen\settings.ini)
    // ------------------------------------------------------------------
    sealed class Settings
    {
        public int ToolbarX = int.MinValue, ToolbarY = int.MinValue, ColorIndex, WidthIndex = 1;
        public bool Collapsed, HideFromCapture = true;

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
                    "Collapsed=" + (Collapsed ? "1" : "0"), "HideFromCapture=" + (HideFromCapture ? "1" : "0")
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
            TopMost = true;
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

        // ---- 창 설정 ----
        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TOOLWINDOW;
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
                screenRect = vs;
                CreateSurface();
                RebuildAndPresent();
                if (toolbar != null) toolbar.EnsureOnScreen();
            });
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
                if (t != Tool.Eraser) lastInkTool = t;
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
            if (prev != IntPtr.Zero && IsHandleCreated && Native.GetForegroundWindow() == Handle)
                Native.SetForegroundWindow(prev);
        }

        public void ToggleDraw() { SetTool(IsDrawing ? Tool.Mouse : lastDrawTool); }

        public void SetColor(int index)
        {
            colorIndex = Geo.Clamp(index, 0, Theme.Palette.Length - 1);
            // 색을 고르면 바로 그릴 수 있게 마지막 그리기 도구로 돌아간다.
            if (tool == Tool.Mouse || tool == Tool.Eraser) SetTool(lastInkTool);
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
            if (active != null || tool == Tool.Eraser) RequestFrame();
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
                "R 사각형 · O 원 · T 텍스트 · E 지우개 · Esc 마우스\n" +
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
    enum IconKind { None, Mouse, Pen, Highlighter, Laser, Line, Arrow, Rect, Ellipse, Text, Eraser, Undo, Redo, Trash, Board, Eye, EyeOff, Camera, ChevronUp, ChevronDown, Close }

    sealed class Toolbar : Form
    {
        static readonly Tool[] ToolOrder = { Tool.Mouse, Tool.Pen, Tool.Highlighter, Tool.Laser, Tool.Line, Tool.Arrow, Tool.Rect, Tool.Ellipse, Tool.Text, Tool.Eraser };
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
            "지우개 (E)\n닿은 획을 통째로 지워요"
        };

        readonly Overlay app;
        readonly ToolTip tip;
        readonly List<TbButton> toolButtons = new List<TbButton>();
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
            TopMost = true;
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
                cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
                return cp;
            }
        }

        protected override bool ShowWithoutActivation { get { return true; } }

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
            int pad = S(8), cell = S(36), gap = S(4), row = S(28), header = S(22), small = S(20);
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
                y += 5 * cell + 4 * gap;
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
                toolButtons[i].Checked = ToolOrder[i] == app.CurrentTool;
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
            using (var b = new SolidBrush(Theme.Dim))
            {
                float d = 3f * scale, x0 = S(14), y0 = S(8) + S(11);
                for (int i = 0; i < 3; i++)
                    for (int j = 0; j < 2; j++)
                        g.FillEllipse(b, x0 + i * 5f * scale - d / 2f, y0 + (j - 0.5f) * 5f * scale - d / 2f, d, d);
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
                    using (var path = Geo.RoundRect(new RectangleF(1f, 1f, 30f, 30f), 7f))
                    using (var b = new SolidBrush(Theme.Accent))
                        g.FillPath(b, path);
                    Icons.Draw(g, IconKind.Pen, new RectangleF(5f, 5f, 22f, 22f), Color.White, Color.White, Board.None, 2.2f);
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
            TopMost = true;
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
                cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
                return cp;
            }
        }

        protected override bool ShowWithoutActivation { get { return true; } }

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
}
