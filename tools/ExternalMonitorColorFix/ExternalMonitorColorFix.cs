using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

internal static class ExternalMonitorColorFix
{
    private const string TargetMonitorModel = "IP24V3";
    private const string LaptopPanelHardwareId = "BOE0D39";
    private const string SrgbProfileFile = "sRGB Color Space Profile.icm";
    private const int DisplayDeviceAttachedToDesktop = 0x00000001;
    private const int EddGetDeviceInterfaceName = 0x00000001;
    private const int ErrorAlreadyExists = 183;
    private const int WcsScopeCurrentUser = 1;
    private const uint ClassMonitor = 0x6d6e7472;
    private const int QueryOnlyActivePaths = 0x00000002;
    private const int DisplayConfigGetSourceName = 1;
    private const int DisplayConfigGetTargetName = 2;
    private const int ErrorInsufficientBuffer = 122;

    [StructLayout(LayoutKind.Sequential)]
    private struct Luid { public uint LowPart; public int HighPart; }

    [StructLayout(LayoutKind.Sequential)]
    private struct DisplayConfigPathSourceInfo
    {
        public Luid adapterId; public uint id; public uint modeInfoIdx; public uint statusFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DisplayConfigRational { public uint Numerator; public uint Denominator; }

    [StructLayout(LayoutKind.Sequential)]
    private struct DisplayConfigPathTargetInfo
    {
        public Luid adapterId; public uint id; public uint modeInfoIdx;
        public int outputTechnology; public int rotation; public int scaling;
        public DisplayConfigRational refreshRate; public int scanLineOrdering;
        [MarshalAs(UnmanagedType.Bool)] public bool targetAvailable;
        public uint statusFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DisplayConfigPathInfo
    {
        public DisplayConfigPathSourceInfo sourceInfo;
        public DisplayConfigPathTargetInfo targetInfo;
        public uint flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DisplayConfigDeviceInfoHeader
    {
        public int type; public uint size; public Luid adapterId; public uint id;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DisplayConfigSourceDeviceName
    {
        public DisplayConfigDeviceInfoHeader header;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string viewGdiDeviceName;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DisplayConfigTargetDeviceName
    {
        public DisplayConfigDeviceInfoHeader header;
        public uint flags; public int outputTechnology;
        public ushort edidManufactureId; public ushort edidProductCodeId;
        public uint connectorInstance;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string monitorFriendlyDeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string monitorDevicePath;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DisplayDevice
    {
        public int cb;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceString;

        public int StateFlags;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceID;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceKey;
    }

    private sealed class MonitorTarget
    {
        public string AdapterDeviceName;
        public string AdapterDescription;
        public string MonitorDescription;
        public string MonitorDeviceId;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumDisplayDevices(
        string lpDevice,
        int iDevNum,
        ref DisplayDevice lpDisplayDevice,
        int dwFlags);

    [DllImport("mscms.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssociateColorProfileWithDevice(
        string machineName,
        string profileName,
        string deviceName);

    [DllImport("mscms.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WcsAssociateColorProfileWithDevice(
        int scope,
        string profileName,
        string deviceName);

    [DllImport("mscms.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WcsSetUsePerUserProfiles(
        string deviceName,
        uint deviceClass,
        [MarshalAs(UnmanagedType.Bool)] bool usePerUserProfiles);

    [DllImport("user32.dll")]
    private static extern int GetDisplayConfigBufferSizes(uint flags, out uint pathCount, out uint modeCount);

    [DllImport("user32.dll")]
    private static extern int QueryDisplayConfig(uint flags, ref uint pathCount,
        [Out] DisplayConfigPathInfo[] paths, ref uint modeCount, IntPtr modes, IntPtr topologyId);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
    private static extern int GetSourceDeviceName(ref DisplayConfigSourceDeviceName request);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
    private static extern int GetTargetDeviceName(ref DisplayConfigTargetDeviceName request);

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool silent = Array.Exists(args, delegate(string arg)
        {
            return string.Equals(arg, "--silent", StringComparison.OrdinalIgnoreCase);
        });

        try
        {
            MonitorTarget target = FindTargetMonitor();
            string profilePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "spool",
                "drivers",
                "color",
                SrgbProfileFile);

            if (!File.Exists(profilePath))
            {
                throw new FileNotFoundException(
                    "The standard Windows sRGB profile was not found.",
                    profilePath);
            }

            if (!WcsSetUsePerUserProfiles(target.AdapterDeviceName, ClassMonitor, true))
            {
                int error = Marshal.GetLastWin32Error();
                throw new Win32Exception(error,
                    "Windows could not enable a per-user monitor profile. Error code: " + error + ".");
            }

            bool associated = WcsAssociateColorProfileWithDevice(
                WcsScopeCurrentUser,
                profilePath,
                target.AdapterDeviceName);

            if (!associated)
            {
                int error = Marshal.GetLastWin32Error();
                if (error != ErrorAlreadyExists)
                {
                    throw new Win32Exception(error,
                        "Windows could not associate the sRGB profile with the external monitor. Error code: " + error + ".");
                }
            }

            string result =
                "sRGB IEC61966-2.1 is now the default color profile for the external monitor.\r\n\r\n" +
                "Monitor: " + target.MonitorDescription + "\r\n" +
                "Display: " + target.AdapterDeviceName + "\r\n" +
                "Graphics: " + target.AdapterDescription + "\r\n\r\n" +
                "The laptop display was not changed.";

            WriteLog("SUCCESS", result);
            if (!silent)
            {
                MessageBox.Show(result, "External Monitor Color Fix",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex)
        {
            string message =
                "No color settings were changed.\r\n\r\n" + ex.Message +
                "\r\n\r\nFor safety, this utility only targets a connected monitor whose name or device ID contains \"" +
                TargetMonitorModel + "\".";

            WriteLog("ERROR", ex.ToString());
            if (!silent)
            {
                MessageBox.Show(message, "External Monitor Color Fix",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            Environment.ExitCode = 1;
        }
    }

    private static MonitorTarget FindTargetMonitor()
    {
        uint pathCount, modeCount;
        int result = GetDisplayConfigBufferSizes(QueryOnlyActivePaths, out pathCount, out modeCount);
        if (result != 0) throw new Win32Exception(result, "Could not enumerate active displays.");

        var paths = new DisplayConfigPathInfo[pathCount];
        int modeSize = 64;
        IntPtr modes = Marshal.AllocHGlobal((int)modeCount * modeSize);
        try
        {
            result = QueryDisplayConfig(QueryOnlyActivePaths, ref pathCount, paths,
                ref modeCount, modes, IntPtr.Zero);
            if (result != 0) throw new Win32Exception(result, "Could not read active display paths.");

            var matches = new List<MonitorTarget>();
            var detected = new List<string>();
            for (int i = 0; i < pathCount; i++)
            {
                var source = new DisplayConfigSourceDeviceName();
                source.header.type = DisplayConfigGetSourceName;
                source.header.size = (uint)Marshal.SizeOf(typeof(DisplayConfigSourceDeviceName));
                source.header.adapterId = paths[i].sourceInfo.adapterId;
                source.header.id = paths[i].sourceInfo.id;

                var target = new DisplayConfigTargetDeviceName();
                target.header.type = DisplayConfigGetTargetName;
                target.header.size = (uint)Marshal.SizeOf(typeof(DisplayConfigTargetDeviceName));
                target.header.adapterId = paths[i].targetInfo.adapterId;
                target.header.id = paths[i].targetInfo.id;

                if (GetSourceDeviceName(ref source) != 0 || GetTargetDeviceName(ref target) != 0) continue;
                string identity = (target.monitorFriendlyDeviceName ?? "") + " " +
                                  (target.monitorDevicePath ?? "");
                detected.Add(source.viewGdiDeviceName + " | " + identity);

                if (identity.IndexOf(TargetMonitorModel, StringComparison.OrdinalIgnoreCase) >= 0 &&
                    identity.IndexOf(LaptopPanelHardwareId, StringComparison.OrdinalIgnoreCase) < 0)
                {
                    matches.Add(new MonitorTarget {
                        AdapterDeviceName = source.viewGdiDeviceName,
                        AdapterDescription = "Active external display",
                        MonitorDescription = target.monitorFriendlyDeviceName,
                        MonitorDeviceId = target.monitorDevicePath
                    });
                }
            }

            if (matches.Count != 1)
                throw new InvalidOperationException("Expected exactly one active " + TargetMonitorModel +
                    " external monitor, but found " + matches.Count + ".\r\nDetected displays:\r\n" +
                    string.Join("\r\n", detected.ToArray()));
            return matches[0];
        }
        finally { Marshal.FreeHGlobal(modes); }
    }

    private static DisplayDevice NewDisplayDevice()
    {
        var device = new DisplayDevice();
        device.cb = Marshal.SizeOf(typeof(DisplayDevice));
        return device;
    }

    private static void WriteLog(string status, string details)
    {
        try
        {
            string exeDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string logPath = Path.Combine(exeDirectory, "ExternalMonitorColorFix.log");
            File.AppendAllText(logPath,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " [" + status + "]\r\n" +
                details + "\r\n\r\n", Encoding.UTF8);
        }
        catch
        {
            // Applying the profile matters more than optional logging.
        }
    }
}
