using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class CrmfIconLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        string launcherPath = Assembly.GetExecutingAssembly().Location;
        string folder = Path.GetDirectoryName(launcherPath);
        string name = Path.GetFileNameWithoutExtension(launcherPath);
        string action;

        if (String.Equals(name, "Start-CMRF", StringComparison.OrdinalIgnoreCase)) action = "Start";
        else if (String.Equals(name, "Stop-CMRF", StringComparison.OrdinalIgnoreCase)) action = "Stop";
        else return 2;

        string batchFile = Path.Combine(folder, action + "-CMRF.bat");
        if (args.Length == 1 && args[0] == "--check") return File.Exists(batchFile) ? 0 : 2;

        if (!File.Exists(batchFile))
        {
            MessageBox.Show("Missing launcher: " + batchFile, "CRMF", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }

        try
        {
            ProcessStartInfo start = new ProcessStartInfo(batchFile);
            start.WorkingDirectory = folder;
            start.UseShellExecute = true;
            using (Process process = Process.Start(start))
            {
                if (process == null) throw new InvalidOperationException("The batch launcher did not start.");
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "CRMF " + action, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
