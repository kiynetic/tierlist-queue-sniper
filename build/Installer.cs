using System;
using System.IO;
using System.IO.Compression;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Reflection;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace QPilotInstaller
{
    public class CustomProgressBar : Control
    {
        private int _value = 0;
        public int Value
        {
            get { return _value; }
            set
            {
                _value = Math.Max(0, Math.Min(100, value));
                Invalidate();
            }
        }

        public CustomProgressBar()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            Height = 8;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (SolidBrush bgBrush = new SolidBrush(Color.FromArgb(21, 27, 40)))
            {
                e.Graphics.FillRectangle(bgBrush, ClientRectangle);
            }

            if (_value > 0)
            {
                int fillWidth = (int)((ClientRectangle.Width * _value) / 100.0);
                using (SolidBrush fillBrush = new SolidBrush(Color.FromArgb(56, 189, 248)))
                {
                    e.Graphics.FillRectangle(fillBrush, 0, 0, fillWidth, Height);
                }
            }

            using (Pen borderPen = new Pen(Color.FromArgb(30, 38, 56)))
            {
                e.Graphics.DrawRectangle(borderPen, 0, 0, Width - 1, Height - 1);
            }
        }
    }

    public class SetupForm : Form
    {
        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();
        [DllImport("user32.dll")]
        public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HT_CAPTION = 0x2;

        private TextBox txtPath;
        private Button btnBrowse;
        private CheckBox chkDesktop;
        private CheckBox chkStartMenu;
        private CheckBox chkLaunch;
        private CustomProgressBar progressBar;
        private Label lblStatus;
        private Button btnAction;
        private Button btnCancel;
        private Label lblTitle;
        private Label lblSubtitle;
        private bool isInstalling = false;
        private bool isFinished = false;
        private bool isUninstallMode = false;

        public SetupForm(bool uninstallMode)
        {
            isUninstallMode = uninstallMode;
            InitializeUI();
        }

        private void InitializeUI()
        {
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(540, 430);
            BackColor = Color.FromArgb(11, 14, 20);
            ForeColor = Color.FromArgb(241, 245, 249);
            Font = new Font("Segoe UI", 9f);

            Panel titleBar = new Panel
            {
                Dock = DockStyle.Top,
                Height = 36,
                BackColor = Color.FromArgb(15, 20, 30)
            };
            titleBar.MouseDown += TitleBar_MouseDown;

            Label titleLabel = new Label
            {
                Text = isUninstallMode ? "qPilot Uninstaller" : "qPilot Setup",
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(14, 8),
                AutoSize = true,
                Font = new Font("Segoe UI", 9f, FontStyle.Regular)
            };
            titleLabel.MouseDown += TitleBar_MouseDown;
            titleBar.Controls.Add(titleLabel);

            Button btnClose = new Button
            {
                Text = "x",
                Size = new Size(36, 36),
                Dock = DockStyle.Right,
                FlatStyle = FlatStyle.Flat,
                ForeColor = Color.FromArgb(148, 163, 184),
                Cursor = Cursors.Hand,
                Font = new Font("Segoe UI", 9f, FontStyle.Regular)
            };
            btnClose.FlatAppearance.BorderSize = 0;
            btnClose.FlatAppearance.MouseOverBackColor = Color.FromArgb(239, 68, 68);
            btnClose.Click += (s, e) => { if (!isInstalling) Close(); };
            titleBar.Controls.Add(btnClose);
            Controls.Add(titleBar);

            lblTitle = new Label
            {
                Text = isUninstallMode ? "Uninstall qPilot" : "qPilot",
                Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                ForeColor = Color.FromArgb(241, 245, 249),
                Location = new Point(28, 52),
                AutoSize = true
            };
            Controls.Add(lblTitle);

            Label badge = new Label
            {
                Text = "v1.0.0 Beta",
                Font = new Font("Segoe UI", 8f, FontStyle.Bold),
                ForeColor = Color.FromArgb(56, 189, 248),
                BackColor = Color.FromArgb(21, 27, 40),
                Location = new Point(lblTitle.Right + 12, 58),
                Padding = new Padding(6, 2, 6, 2),
                AutoSize = true
            };
            Controls.Add(badge);

            lblSubtitle = new Label
            {
                Text = isUninstallMode ? "Are you sure you want to remove qPilot from your system?" : "Fast Discord Tierlist Waitlist Sniper",
                ForeColor = Color.FromArgb(148, 163, 184),
                Font = new Font("Segoe UI", 9f),
                Location = new Point(30, 82),
                Size = new Size(480, 20)
            };
            Controls.Add(lblSubtitle);

            Panel lineTop = new Panel
            {
                Location = new Point(28, 110),
                Size = new Size(484, 1),
                BackColor = Color.FromArgb(30, 38, 56)
            };
            Controls.Add(lineTop);

            if (!isUninstallMode)
            {
                Label lblPathDesc = new Label
                {
                    Text = "Destination Folder",
                    ForeColor = Color.FromArgb(148, 163, 184),
                    Font = new Font("Segoe UI", 8.5f),
                    Location = new Point(28, 124),
                    AutoSize = true
                };
                Controls.Add(lblPathDesc);

                string defaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "qPilot");
                txtPath = new TextBox
                {
                    Text = defaultPath,
                    Location = new Point(30, 145),
                    Size = new Size(385, 25),
                    BackColor = Color.FromArgb(15, 20, 30),
                    ForeColor = Color.FromArgb(226, 232, 240),
                    BorderStyle = BorderStyle.FixedSingle
                };
                Controls.Add(txtPath);

                btnBrowse = new Button
                {
                    Text = "Browse...",
                    Location = new Point(423, 144),
                    Size = new Size(89, 26),
                    FlatStyle = FlatStyle.Flat,
                    BackColor = Color.FromArgb(21, 27, 40),
                    ForeColor = Color.FromArgb(226, 232, 240),
                    Cursor = Cursors.Hand
                };
                btnBrowse.FlatAppearance.BorderColor = Color.FromArgb(30, 38, 56);
                btnBrowse.Click += (s, e) =>
                {
                    using (FolderBrowserDialog dlg = new FolderBrowserDialog())
                    {
                        dlg.SelectedPath = txtPath.Text;
                        if (dlg.ShowDialog() == DialogResult.OK)
                        {
                            txtPath.Text = Path.Combine(dlg.SelectedPath, "qPilot");
                        }
                    }
                };
                Controls.Add(btnBrowse);

                chkDesktop = new CheckBox
                {
                    Text = "Create Desktop Shortcut",
                    Checked = true,
                    ForeColor = Color.FromArgb(203, 213, 225),
                    Location = new Point(30, 185),
                    AutoSize = true,
                    Cursor = Cursors.Hand
                };
                Controls.Add(chkDesktop);

                chkStartMenu = new CheckBox
                {
                    Text = "Create Start Menu Shortcut",
                    Checked = true,
                    ForeColor = Color.FromArgb(203, 213, 225),
                    Location = new Point(30, 213),
                    AutoSize = true,
                    Cursor = Cursors.Hand
                };
                Controls.Add(chkStartMenu);

                chkLaunch = new CheckBox
                {
                    Text = "Launch qPilot after installation",
                    Checked = true,
                    ForeColor = Color.FromArgb(203, 213, 225),
                    Location = new Point(30, 241),
                    AutoSize = true,
                    Cursor = Cursors.Hand
                };
                Controls.Add(chkLaunch);
            }
            else
            {
                Label lblUninstallInfo = new Label
                {
                    Text = "This will completely remove qPilot and its desktop shortcuts from your system.\nYour local settings will be preserved unless manually deleted.",
                    ForeColor = Color.FromArgb(203, 213, 225),
                    Font = new Font("Segoe UI", 9.5f),
                    Location = new Point(30, 140),
                    Size = new Size(480, 70)
                };
                Controls.Add(lblUninstallInfo);
            }

            lblStatus = new Label
            {
                Text = isUninstallMode ? "Ready to uninstall." : "Ready to install.",
                ForeColor = Color.FromArgb(148, 163, 184),
                Font = new Font("Segoe UI", 8.5f),
                Location = new Point(28, 280),
                Size = new Size(484, 18)
            };
            Controls.Add(lblStatus);

            progressBar = new CustomProgressBar
            {
                Location = new Point(30, 304),
                Size = new Size(482, 6)
            };
            Controls.Add(progressBar);

            Panel lineBottom = new Panel
            {
                Location = new Point(28, 360),
                Size = new Size(484, 1),
                BackColor = Color.FromArgb(30, 38, 56)
            };
            Controls.Add(lineBottom);

            btnCancel = new Button
            {
                Text = "Cancel",
                Location = new Point(310, 376),
                Size = new Size(88, 34),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(21, 27, 40),
                ForeColor = Color.FromArgb(148, 163, 184),
                Cursor = Cursors.Hand
            };
            btnCancel.FlatAppearance.BorderColor = Color.FromArgb(30, 38, 56);
            btnCancel.Click += (s, e) => { if (!isInstalling) Close(); };
            Controls.Add(btnCancel);

            btnAction = new Button
            {
                Text = isUninstallMode ? "Uninstall" : "Install",
                Location = new Point(410, 376),
                Size = new Size(102, 34),
                FlatStyle = FlatStyle.Flat,
                BackColor = isUninstallMode ? Color.FromArgb(239, 68, 68) : Color.FromArgb(56, 189, 248),
                ForeColor = isUninstallMode ? Color.White : Color.FromArgb(11, 14, 20),
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnAction.FlatAppearance.BorderSize = 0;
            btnAction.Click += (s, e) =>
            {
                if (isFinished)
                {
                    if (!isUninstallMode && chkLaunch != null && chkLaunch.Checked)
                    {
                        string exePath = Path.Combine(txtPath.Text, "qPilot.exe");
                        if (File.Exists(exePath))
                        {
                            Process.Start(new ProcessStartInfo(exePath) { WorkingDirectory = txtPath.Text });
                        }
                    }
                    Close();
                    return;
                }

                if (isUninstallMode)
                {
                    StartUninstall();
                }
                else
                {
                    StartInstall();
                }
            };
            Controls.Add(btnAction);

            Paint += (s, e) =>
            {
                using (Pen pen = new Pen(Color.FromArgb(30, 38, 56)))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
                }
            };
        }

        private void TitleBar_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                ReleaseCapture();
                SendMessage(Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
            }
        }

        private void StartInstall()
        {
            string targetDir = txtPath.Text.Trim();
            if (string.IsNullOrEmpty(targetDir)) return;

            isInstalling = true;
            btnAction.Enabled = false;
            btnCancel.Enabled = false;
            if (btnBrowse != null) btnBrowse.Enabled = false;
            if (txtPath != null) txtPath.ReadOnly = true;

            bool createDesktop = chkDesktop.Checked;
            bool createStartMenu = chkStartMenu.Checked;

            Thread worker = new Thread(() =>
            {
                try
                {
                    SetStatus("Preparing installation...", 5);
                    KillRunningProcesses();

                    if (!Directory.Exists(targetDir))
                    {
                        Directory.CreateDirectory(targetDir);
                    }

                    SetStatus("Extracting application files...", 10);
                    Assembly currentAssembly = Assembly.GetExecutingAssembly();
                    using (Stream zipStream = currentAssembly.GetManifestResourceStream("qpilot_payload"))
                    {
                        if (zipStream == null)
                        {
                            throw new Exception("Embedded installation payload not found.");
                        }

                        using (ZipArchive archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                        {
                            int total = archive.Entries.Count;
                            int count = 0;

                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                string destinationPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));
                                if (!destinationPath.StartsWith(Path.GetFullPath(targetDir), StringComparison.OrdinalIgnoreCase))
                                {
                                    continue;
                                }

                                if (string.IsNullOrEmpty(entry.Name))
                                {
                                    Directory.CreateDirectory(destinationPath);
                                }
                                else
                                {
                                    string dir = Path.GetDirectoryName(destinationPath);
                                    if (!Directory.Exists(dir))
                                    {
                                        Directory.CreateDirectory(dir);
                                    }

                                    entry.ExtractToFile(destinationPath, true);
                                }

                                count++;
                                int pct = 10 + (int)((count / (double)total) * 75);
                                SetStatus(string.Format("Extracting {0} ({1}/{2})...", entry.Name, count, total), pct);
                            }
                        }
                    }

                    SetStatus("Configuring shortcuts and uninstaller...", 88);
                    string targetExe = Path.Combine(targetDir, "qPilot.exe");
                    string uninstallerExe = Path.Combine(targetDir, "Uninstall.exe");
                    try
                    {
                        File.Copy(Assembly.GetExecutingAssembly().Location, uninstallerExe, true);
                    }
                    catch { }

                    if (createDesktop)
                    {
                        string desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "qPilot.lnk");
                        CreateShortcut(desktopPath, targetExe, targetDir);
                    }

                    if (createStartMenu)
                    {
                        string programsFolder = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                        string startLink = Path.Combine(programsFolder, "qPilot.lnk");
                        CreateShortcut(startLink, targetExe, targetDir);
                    }

                    SetStatus("Registering with Windows...", 95);
                    RegisterUninstaller(targetDir, uninstallerExe, targetExe);

                    SetStatus("Installation completed successfully!", 100);
                    Invoke(new Action(() =>
                    {
                        isInstalling = false;
                        isFinished = true;
                        btnAction.Text = "Finish";
                        btnAction.BackColor = Color.FromArgb(56, 189, 248);
                        btnAction.ForeColor = Color.FromArgb(11, 14, 20);
                        btnAction.Enabled = true;
                        btnCancel.Visible = false;
                        lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                    }));
                }
                catch (Exception ex)
                {
                    Invoke(new Action(() =>
                    {
                        isInstalling = false;
                        btnAction.Enabled = true;
                        btnCancel.Enabled = true;
                        lblStatus.Text = "Error: " + ex.Message;
                        lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
                    }));
                }
            });

            worker.IsBackground = true;
            worker.Start();
        }

        private void StartUninstall()
        {
            isInstalling = true;
            btnAction.Enabled = false;
            btnCancel.Enabled = false;

            Thread worker = new Thread(() =>
            {
                try
                {
                    SetStatus("Closing running qPilot instances...", 20);
                    KillRunningProcesses();

                    SetStatus("Removing shortcuts...", 40);
                    string desktopPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "qPilot.lnk");
                    if (File.Exists(desktopPath)) File.Delete(desktopPath);

                    string programsFolder = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                    string startLink = Path.Combine(programsFolder, "qPilot.lnk");
                    if (File.Exists(startLink)) File.Delete(startLink);

                    SetStatus("Removing registry keys...", 60);
                    try
                    {
                        Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\qPilot", false);
                    }
                    catch { }

                    SetStatus("Scheduling directory cleanup...", 85);
                    string installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = string.Format("/c ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{0}\"", installDir),
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);

                    SetStatus("Uninstallation complete.", 100);
                    Invoke(new Action(() =>
                    {
                        isInstalling = false;
                        isFinished = true;
                        btnAction.Text = "Close";
                        btnAction.BackColor = Color.FromArgb(56, 189, 248);
                        btnAction.ForeColor = Color.FromArgb(11, 14, 20);
                        btnAction.Enabled = true;
                        btnCancel.Visible = false;
                        lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                    }));
                }
                catch (Exception ex)
                {
                    Invoke(new Action(() =>
                    {
                        isInstalling = false;
                        btnAction.Enabled = true;
                        btnCancel.Enabled = true;
                        lblStatus.Text = "Error: " + ex.Message;
                        lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
                    }));
                }
            });

            worker.IsBackground = true;
            worker.Start();
        }

        private void SetStatus(string text, int pct)
        {
            if (InvokeRequired)
            {
                Invoke(new Action<string, int>(SetStatus), text, pct);
                return;
            }

            lblStatus.Text = text;
            progressBar.Value = pct;
        }

        private void KillRunningProcesses()
        {
            Process[] procs = Process.GetProcessesByName("qPilot");
            foreach (Process p in procs)
            {
                try
                {
                    p.Kill();
                    p.WaitForExit(3000);
                }
                catch { }
            }
        }

        private void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    dynamic shell = Activator.CreateInstance(shellType);
                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = targetPath;
                    shortcut.WorkingDirectory = workingDir;
                    shortcut.IconLocation = targetPath + ",0";
                    shortcut.Save();
                }
            }
            catch { }
        }

        private void RegisterUninstaller(string installDir, string uninstallerExe, string targetExe)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\qPilot"))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "qPilot");
                        key.SetValue("DisplayVersion", "1.0.0");
                        key.SetValue("Publisher", "kiynetic");
                        key.SetValue("DisplayIcon", targetExe + ",0");
                        key.SetValue("InstallLocation", installDir);
                        key.SetValue("UninstallString", "\"" + uninstallerExe + "\" /uninstall");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            }
            catch { }
        }
    }

    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool isUninstall = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/uninstall", StringComparison.OrdinalIgnoreCase) || arg.Equals("-uninstall", StringComparison.OrdinalIgnoreCase))
                {
                    isUninstall = true;
                    break;
                }
            }

            Application.Run(new SetupForm(isUninstall));
        }
    }
}
