; Compilar tras instalar Inno Setup 6: winget install JRSoftware.InnoSetup
; Desde la raíz del repositorio: ISCC.exe /DAppVersion=<versión> installer\windows\agentrelay.iss
; El instalador solo presenta opciones y delega todo el trabajo en install.ps1.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppName=AgentRelay
AppVersion={#AppVersion}
AppPublisher=CatLinux
DefaultDirName={userdocs}\AgentRelay
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
WizardStyle=modern
OutputBaseFilename=AgentRelay-Setup
OutputDir=..\..\.agentrelay\installer
Compression=lzma2
SolidCompression=yes
ShowLanguageDialog=no
Uninstallable=no
CreateUninstallRegKey=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "install.ps1"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

[Messages]
FinishedLabel=La instalación terminó. Abre una terminal nueva y ejecuta: agentrelay doctor. Las instrucciones de delegación solo se cargan en sesiones nuevas: cierra y abre de nuevo Claude Code.

[Code]
var
  ExecutorsPage: TInputOptionWizardPage;
  AccountPage: TInputOptionWizardPage;
  InstallFailed: Boolean;

procedure InitializeWizard;
begin
  ExecutorsPage := CreateInputOptionPage(
    wpSelectDir,
    'Ejecutores opcionales',
    'Selecciona los ejecutores que quieres instalar',
    'Codex con GPT-6 Luna ya se instala siempre.',
    False,
    False);
  ExecutorsPage.Add('OpenCode (modelos gratuitos y de pago)');

  AccountPage := CreateInputOptionPage(
    ExecutorsPage.ID,
    'Conectar cuenta',
    'Conecta tu cuenta de ChatGPT',
    'Puedes completar la conexión al terminar la instalación.',
    False,
    False);
  AccountPage.Add('Conectar mi cuenta de ChatGPT al terminar (se abre el navegador)');
  AccountPage.Values[0] := True;

  InstallFailed := False;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Parameters: string;
  SelectedExecutors: string;
  ScriptPath: string;
  ResultCode: Integer;
  Started: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    ScriptPath := ExpandConstant('{tmp}\install.ps1');
    Parameters := '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath +
      '" -InstallDir "' + ExpandConstant('{app}') + '"';

    SelectedExecutors := '';
    if ExecutorsPage.Values[0] then
      SelectedExecutors := 'opencode';
    if SelectedExecutors <> '' then
      Parameters := Parameters + ' -Executors "' + SelectedExecutors + '"';

    if AccountPage.Values[0] then
      Parameters := Parameters + ' -Login';

    Started := Exec(
      ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      Parameters,
      ExpandConstant('{tmp}'),
      SW_SHOW,
      ewWaitUntilTerminated,
      ResultCode);

    if (not Started) or (ResultCode <> 0) then
    begin
      InstallFailed := True;
      MsgBox(
        'La instalación no se completó. Revisa la ventana de PowerShell o ejecuta a mano el script installer\windows\install.ps1 del repositorio https://github.com/catlinux/AgentRelay.',
        mbError,
        MB_OK);
    end;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and InstallFailed then
    WizardForm.FinishedLabel.Caption :=
      'La instalación no se completó. Revisa el mensaje anterior y la ventana de PowerShell.';
end;
