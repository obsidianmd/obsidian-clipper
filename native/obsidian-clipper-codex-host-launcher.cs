using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

public static class Program
{
	public static int Main()
	{
		try
		{
			string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
			string hostScript = Path.Combine(baseDirectory, "obsidian-clipper-codex-host.mjs");
			string nodePath = Environment.GetEnvironmentVariable("OBSIDIAN_CLIPPER_NODE");
			if (String.IsNullOrWhiteSpace(nodePath))
			{
				nodePath = "node.exe";
			}

			ProcessStartInfo startInfo = new ProcessStartInfo();
			startInfo.FileName = nodePath;
			startInfo.Arguments = Quote(hostScript);
			startInfo.WorkingDirectory = baseDirectory;
			startInfo.UseShellExecute = false;
			startInfo.RedirectStandardInput = true;
			startInfo.RedirectStandardOutput = true;
			startInfo.RedirectStandardError = true;
			startInfo.CreateNoWindow = true;

			using (Process process = Process.Start(startInfo))
			{
				if (process == null)
				{
					Console.Error.WriteLine("Failed to start Node.js host process.");
					return 1;
				}

				Task stdinTask = ForwardSingleNativeMessageAsync(process);
				Task stdoutTask = process.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
				Task stderrTask = process.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());

				process.WaitForExit();
				Task.WaitAll(new Task[] { stdoutTask, stderrTask }, TimeSpan.FromSeconds(2));
				if (stdinTask.IsCompleted)
				{
					try
					{
						stdinTask.Wait();
					}
					catch
					{
					}
				}
				return process.ExitCode;
			}
		}
		catch (Exception error)
		{
			Console.Error.WriteLine(error.ToString());
			return 1;
		}
	}

	private static async Task ForwardSingleNativeMessageAsync(Process process)
	{
		try
		{
			Stream input = Console.OpenStandardInput();
			Stream output = process.StandardInput.BaseStream;
			byte[] header = await ReadExactOrNullAsync(input, 4);
			if (header == null)
			{
				return;
			}

			int length = BitConverter.ToInt32(header, 0);
			if (length < 0 || length > 64 * 1024 * 1024)
			{
				throw new InvalidDataException("Native message length is invalid.");
			}

			byte[] body = await ReadExactAsync(input, length);
			await output.WriteAsync(header, 0, header.Length);
			await output.WriteAsync(body, 0, body.Length);
			await output.FlushAsync();
		}
		catch
		{
		}
		finally
		{
			try
			{
				process.StandardInput.Close();
			}
			catch
			{
			}
		}
	}

	private static async Task<byte[]> ReadExactAsync(Stream stream, int length)
	{
		byte[] buffer = new byte[length];
		int offset = 0;
		while (offset < length)
		{
			int read = await stream.ReadAsync(buffer, offset, length - offset);
			if (read == 0)
			{
				throw new EndOfStreamException("Unexpected end of native message.");
			}
			offset += read;
		}
		return buffer;
	}

	private static async Task<byte[]> ReadExactOrNullAsync(Stream stream, int length)
	{
		byte[] buffer = new byte[length];
		int offset = 0;
		while (offset < length)
		{
			int read = await stream.ReadAsync(buffer, offset, length - offset);
			if (read == 0)
			{
				if (offset == 0)
				{
					return null;
				}
				throw new EndOfStreamException("Unexpected end of native message header.");
			}
			offset += read;
		}
		return buffer;
	}

	private static string Quote(string value)
	{
		return "\"" + value.Replace("\"", "\\\"") + "\"";
	}
}
