$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class OutputModes {
 [StructLayout(LayoutKind.Sequential)] public struct Luid { public uint Low; public int High; }
 [StructLayout(LayoutKind.Sequential)] public struct Rational { public uint N; public uint D; }
 [StructLayout(LayoutKind.Sequential)] public struct Size { public uint W; public uint H; }
 [StructLayout(LayoutKind.Sequential)] public struct Video { public ulong Rate; public Rational HSync; public Rational VSync; public Size Active; public Size Total; public uint Standard; public uint Scan; }
 [StructLayout(LayoutKind.Explicit, Size=48)] public struct ModeUnion { [FieldOffset(0)] public Video Video; }
 [StructLayout(LayoutKind.Sequential)] public struct Mode { public uint Type; public uint Id; public Luid Adapter; public ModeUnion Data; }
 [StructLayout(LayoutKind.Sequential)] public struct Source { public Luid Adapter; public uint Id; public uint ModeIndex; public uint Flags; }
 [StructLayout(LayoutKind.Sequential)] public struct Target { public Luid Adapter; public uint Id; public uint ModeIndex; public uint Technology; public uint Rotation; public uint Scaling; public Rational Refresh; public uint Scan; public int Available; public uint Flags; }
 [StructLayout(LayoutKind.Sequential)] public struct Path { public Source Source; public Target Target; public uint Flags; }
 [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
 [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint count, [Out] Path[] paths, ref uint modes, [Out] Mode[] modeData, IntPtr topology);
 public class Output { public string identity; public uint width; public uint height; public double refreshRate; public string provider="Windows QueryDisplayConfig target mode"; }
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Device {
  public uint Size; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Name;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Description; public uint Flags;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Id;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Key;
 }
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool EnumDisplayDevices(string device, uint index, ref Device info, uint flags);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool EnumDisplaySettings(string device, int mode, IntPtr data);
 static Output[] DesktopModes() {
  var result=new List<Output>();
  for(uint index=0; index<32; index++) {
   Device device=new Device(); device.Size=(uint)Marshal.SizeOf(typeof(Device));
   if(!EnumDisplayDevices(null,index,ref device,0)) break; if((device.Flags&1)==0 || (device.Flags&8)!=0) continue;
   IntPtr data=Marshal.AllocHGlobal(220);
   try {
    for(int i=0;i<220;i++) Marshal.WriteByte(data,i,0); Marshal.WriteInt16(data,68,220);
    if(EnumDisplaySettings(device.Name,-1,data)) result.Add(new Output { identity=device.Name, width=(uint)Marshal.ReadInt32(data,172), height=(uint)Marshal.ReadInt32(data,176), refreshRate=Marshal.ReadInt32(data,184), provider="Windows EnumDisplaySettings desktop mode" });
   } finally { Marshal.FreeHGlobal(data); }
  }
  if(result.Count==0) throw new Exception("Display query unavailable in this session");
  return result.ToArray();
 }
 public static Output[] Read() {
  for(int attempt=0; attempt<3; attempt++) {
   uint pc,mc; int error=GetDisplayConfigBufferSizes(2,out pc,out mc); if(error!=0) return DesktopModes();
   Path[] paths=new Path[pc]; Mode[] modes=new Mode[mc]; error=QueryDisplayConfig(2,ref pc,paths,ref mc,modes,IntPtr.Zero);
   if(error==122) continue; if(error!=0) return DesktopModes();
   var result=new List<Output>();
   for(int i=0;i<pc;i++) {
    var target=paths[i].Target; uint idx=target.ModeIndex;
    if(idx>=mc || modes[idx].Type!=2) continue;
    var video=modes[idx].Data.Video;
    result.Add(new Output { identity=target.Adapter.High+":"+target.Adapter.Low+":"+target.Id, width=video.Active.W, height=video.Active.H, refreshRate=video.VSync.D>0?(double)video.VSync.N/video.VSync.D:0 });
   }
   return result.ToArray();
  }
  throw new Exception("Display topology changed during query");
 }
}
'@
ConvertTo-Json -InputObject @([OutputModes]::Read()) -Compress
