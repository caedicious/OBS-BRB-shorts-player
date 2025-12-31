; OBS BRB Shorts Installer Script
; Requires Inno Setup 6.x - https://jrsoftware.org/isinfo.php

#define MyAppName "OBS BRB Shorts"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Your Name"
#define MyAppURL "https://github.com/yourusername/obs-brb-shorts"
#define MyAppExeName "OBS-BRB-Shorts.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=LICENSE.txt
PrivilegesRequired=admin
OutputDir=installer
OutputBaseFilename=OBS-BRB-Shorts-Setup
SetupIconFile=icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Start automatically with Windows"; GroupDescription: "Startup:"; Flags: unchecked
Name: "firewall"; Description: "Add Windows Firewall rule (required for network access)"; GroupDescription: "Network:"

[Files]
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "transition.mp4"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure AddFirewallRule();
var
  ResultCode: Integer;
begin
  if IsTaskSelected('firewall') then
  begin
    Exec('netsh', 'advfirewall firewall add rule name="OBS BRB Shorts" dir=in action=allow protocol=tcp localport=3000', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure RemoveFirewallRule();
var
  ResultCode: Integer;
begin
  Exec('netsh', 'advfirewall firewall delete rule name="OBS BRB Shorts"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    AddFirewallRule();
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    RemoveFirewallRule();
    // Clean up environment variables
    Exec('setx', 'OBS_BRB_YT_API_KEY ""', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('setx', 'OBS_BRB_YT_CHANNEL_ID ""', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('setx', 'OBS_BRB_FILTER_MODE ""', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('setx', 'OBS_BRB_USE_TRANSITION ""', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
