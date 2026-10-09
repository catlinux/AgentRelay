param(
    [string]$InstallDir = (Join-Path $HOME 'Documents\AgentRelay'),
    [string]$Executors = '',
    [switch]$Login,
    [switch]$DryRun,
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$RepositoryUrl = 'https://github.com/catlinux/AgentRelay.git'

function Get-ApplicationPath {
    param([string]$Name)

    $command = Get-Command -Name $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) {
        return $null
    }
    return $command.Path
}

function Invoke-CapturedCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$Description
    )

    $result = & $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $output = (($result | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
    if ($exitCode -ne 0) {
        $detail = ''
        if ($output) {
            $detail = "`n$output"
        }
        throw "$Description falló (código $exitCode).$detail"
    }
    return $output
}

function Invoke-CheckedCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$Description
    )

    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "$Description falló (código $exitCode)."
    }
}

function Write-SimulatedCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    $parts = @($FilePath) + @($Arguments)
    Write-Host "[simulación] $($parts -join ' ')"
}

function Refresh-SessionPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::Machine)
    $userPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
    $pathParts = @()
    if ($machinePath) {
        $pathParts += $machinePath
    }
    if ($userPath) {
        $pathParts += $userPath
    }
    $env:Path = $pathParts -join ';'
}

function Get-NodeMajorVersion {
    param([string]$NodePath)

    $versionText = Invoke-CapturedCommand -FilePath $NodePath -Arguments @('--version') -Description 'La comprobación de Node.js'
    if ($versionText -match '^v?(\d+)\.') {
        return [int]$Matches[1]
    }
    return -1
}

function Test-ExpectedOrigin {
    param([string]$Origin)

    $normalized = $Origin.Trim() -replace '\.git$', ''
    $normalized = $normalized -replace '^https://github\.com/', 'github:'
    $normalized = $normalized -replace '^http://github\.com/', 'github:'
    $normalized = $normalized -replace '^ssh://git@github\.com/', 'github:'
    $normalized = $normalized -replace '^git@github\.com:', 'github:'
    return $normalized.Equals('github:catlinux/AgentRelay', [StringComparison]::OrdinalIgnoreCase)
}

function Invoke-InstallCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$Description
    )

    if ($DryRun) {
        Write-SimulatedCommand -FilePath $FilePath -Arguments $Arguments
    }
    else {
        Invoke-CheckedCommand -FilePath $FilePath -Arguments $Arguments -Description $Description
    }
}

try {
    Write-Host 'Instalador de AgentRelay para Windows.'
    Write-Host '[1/6] Preparar la instalación.'

    if ([string]::IsNullOrWhiteSpace($Branch)) {
        throw 'Branch no puede estar vacío.'
    }
    $requestedExecutors = @($Executors.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
    $requestedExecutors = @($requestedExecutors | Select-Object -Unique)
    $unknownExecutors = @($requestedExecutors | Where-Object { $_ -notin @('opencode') })
    if ($unknownExecutors.Count -gt 0) {
        throw "Ejecutores no válidos: $($unknownExecutors -join ', '). Opción disponible: opencode."
    }

    $InstallDir = [System.IO.Path]::GetFullPath($InstallDir)

    Write-Host '[2/6] Comprobar e instalar Node.js y Git si hacen falta.'
    $nodePath = Get-ApplicationPath -Name 'node.exe'
    if (-not $nodePath) {
        $nodePath = Get-ApplicationPath -Name 'node'
    }
    $needsNode = $true
    if ($nodePath) {
        $nodeMajor = Get-NodeMajorVersion -NodePath $nodePath
        $needsNode = ($nodeMajor -lt 20)
    }

    $gitPath = Get-ApplicationPath -Name 'git.exe'
    if (-not $gitPath) {
        $gitPath = Get-ApplicationPath -Name 'git'
    }
    $needsGit = -not [bool]$gitPath
    if ($gitPath) {
        [void](Invoke-CapturedCommand -FilePath $gitPath -Arguments @('--version') -Description 'La comprobación de Git')
    }

    $wingetPath = Get-ApplicationPath -Name 'winget.exe'
    if (-not $wingetPath) {
        $wingetPath = Get-ApplicationPath -Name 'winget'
    }
    if (($needsNode -or $needsGit) -and -not $wingetPath) {
        throw 'No se encontró winget. Instala Node.js desde https://nodejs.org/en/download/ y Git desde https://git-scm.com/download/win, y vuelve a ejecutar este instalador.'
    }

    if ($needsNode) {
        $nodeInstallArgs = @('install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--accept-source-agreements', '--accept-package-agreements')
        if ($DryRun) {
            Write-SimulatedCommand -FilePath $wingetPath -Arguments $nodeInstallArgs
        }
        else {
            Invoke-CheckedCommand -FilePath $wingetPath -Arguments $nodeInstallArgs -Description 'La instalación de Node.js con winget'
        }
    }
    if ($needsGit) {
        $gitInstallArgs = @('install', '--id', 'Git.Git', '-e', '--accept-source-agreements', '--accept-package-agreements')
        if ($DryRun) {
            Write-SimulatedCommand -FilePath $wingetPath -Arguments $gitInstallArgs
        }
        else {
            Invoke-CheckedCommand -FilePath $wingetPath -Arguments $gitInstallArgs -Description 'La instalación de Git con winget'
        }
    }
    if ($DryRun -and -not $nodePath) {
        $nodePath = 'node.exe'
    }
    if ($DryRun -and -not $gitPath) {
        $gitPath = 'git.exe'
    }
    if (($needsNode -or $needsGit) -and $DryRun) {
        Write-Host '[simulación] Actualizar PATH de la sesión desde las variables de entorno de Máquina y Usuario.'
    }
    elseif ($needsNode -or $needsGit) {
        Refresh-SessionPath
        $nodePath = Get-ApplicationPath -Name 'node.exe'
        if (-not $nodePath) {
            $nodePath = Get-ApplicationPath -Name 'node'
        }
        if (-not $nodePath -or (Get-NodeMajorVersion -NodePath $nodePath) -lt 20) {
            throw 'Node.js 20 o posterior no está disponible en PATH después de instalarlo con winget.'
        }
        $gitPath = Get-ApplicationPath -Name 'git.exe'
        if (-not $gitPath) {
            $gitPath = Get-ApplicationPath -Name 'git'
        }
        if (-not $gitPath) {
            throw 'Git no está disponible en PATH después de instalarlo con winget.'
        }
        [void](Invoke-CapturedCommand -FilePath $gitPath -Arguments @('--version') -Description 'La comprobación de Git tras la instalación')
    }

    Write-Host '[3/6] Clonar o actualizar AgentRelay.'
    $installDirExists = Test-Path -LiteralPath $InstallDir
    if ($installDirExists -and -not (Get-Item -LiteralPath $InstallDir).PSIsContainer) {
        throw "La ruta de instalación existe y no es una carpeta: $InstallDir. No se modificó."
    }

    $needsClone = -not $installDirExists
    if ($installDirExists) {
        $contents = @(Get-ChildItem -LiteralPath $InstallDir -Force)
        $needsClone = ($contents.Count -eq 0)
        if (-not $needsClone) {
            if (-not $gitPath) {
                throw "La carpeta de instalación no está vacía y no se puede comprobar su origen porque Git no está disponible en esta sesión: $InstallDir. No se modificó."
            }
            try {
                $origin = Invoke-CapturedCommand -FilePath $gitPath -Arguments @('-C', $InstallDir, 'remote', 'get-url', 'origin') -Description 'La comprobación del repositorio existente'
            }
            catch {
                throw "La carpeta existe, no está vacía y no es un clon reconocible de ${RepositoryUrl}: $InstallDir. No se modificó."
            }
            if (-not (Test-ExpectedOrigin -Origin $origin)) {
                throw "La carpeta existe, no está vacía y su origin no apunta a ${RepositoryUrl}: $InstallDir. No se modificó."
            }

            try {
                $workingTree = Invoke-CapturedCommand -FilePath $gitPath -Arguments @('-C', $InstallDir, 'status', '--porcelain') -Description 'La comprobación de cambios locales'
            }
            catch {
                throw "No se pudo comprobar el estado del clon en $InstallDir. No se modificó."
            }
            if (-not [string]::IsNullOrWhiteSpace($workingTree)) {
                throw "El clon existente tiene cambios sin confirmar: $InstallDir. No se modificó; guarda o retira esos cambios antes de volver a ejecutar el instalador."
            }
        }
    }

    if ($needsClone) {
        $parentDir = Split-Path -Parent $InstallDir
        if (-not (Test-Path -LiteralPath $parentDir)) {
            if ($DryRun) {
                Write-Host "[simulación] Crear la carpeta padre $parentDir"
            }
            else {
                New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
            }
        }
        $cloneArgs = @('clone', '--branch', $Branch, $RepositoryUrl, $InstallDir)
        Invoke-InstallCommand -FilePath $gitPath -Arguments $cloneArgs -Description 'git clone'
    }
    elseif ($installDirExists) {
        $pullArgs = @('-C', $InstallDir, 'pull', '--ff-only')
        Invoke-InstallCommand -FilePath $gitPath -Arguments $pullArgs -Description 'git pull --ff-only'
    }

    Write-Host '[4/6] Instalar dependencias y enlazar el comando agentrelay.'
    $npmPath = Get-ApplicationPath -Name 'npm.cmd'
    if (-not $npmPath) {
        $npmPath = Get-ApplicationPath -Name 'npm'
    }
    if (-not $npmPath -and $DryRun) {
        $npmPath = 'npm.cmd'
    }
    if (-not $npmPath) {
        throw 'No se encontró npm.cmd después de instalar Node.js.'
    }

    if ($DryRun) {
        Write-Host "[simulación] Ejecutar npm desde $InstallDir"
        Invoke-InstallCommand -FilePath $npmPath -Arguments @('ci') -Description 'npm ci'
        Invoke-InstallCommand -FilePath $npmPath -Arguments @('link') -Description 'npm link; comprueba la instalación global de agentrelay'
    }
    else {
        Push-Location -LiteralPath $InstallDir
        try {
            Invoke-InstallCommand -FilePath $npmPath -Arguments @('ci') -Description 'npm ci'
            Invoke-InstallCommand -FilePath $npmPath -Arguments @('link') -Description 'npm link; comprueba la instalación global de agentrelay'
        }
        finally {
            Pop-Location
        }
    }

    $agentRelayCommand = Get-ApplicationPath -Name 'agentrelay.cmd'
    if ($agentRelayCommand) {
        $agentRelayPrefix = $agentRelayCommand
        $agentRelayArgs = @()
    }
    else {
        $agentRelayPrefix = $nodePath
        $agentRelayArgs = @((Join-Path $InstallDir 'bin\agentrelay.js'))
    }

    Write-Host '[5/6] Configurar AgentRelay.'
    $setupArgs = @($agentRelayArgs) + @('setup', '--yes')
    if ($requestedExecutors.Count -gt 0) {
        $setupArgs += @('--executors', ($requestedExecutors -join ','))
    }
    if ($Login) {
        $setupArgs += '--login'
    }
    Invoke-InstallCommand -FilePath $agentRelayPrefix -Arguments $setupArgs -Description 'agentrelay setup'

    Write-Host '[6/6] Ejecutar el diagnóstico final.'
    $doctorArgs = @($agentRelayArgs) + @('doctor')
    Invoke-InstallCommand -FilePath $agentRelayPrefix -Arguments $doctorArgs -Description 'agentrelay doctor'

    if ($DryRun) {
        Write-Host '[simulación] Instalación simulada; no se ejecutaron acciones que cambien el sistema.'
        if (-not $Login) {
            Write-Host '[simulación] Tras una instalación real, el siguiente paso sería ejecutar agentrelay.cmd login.'
        }
    }
    else {
        Write-Host 'Instalación de AgentRelay completada.'
        Write-Host 'Las instrucciones de delegación solo se cargan en sesiones nuevas: cierra y abre de nuevo Claude Code.'
        if ($Login) {
            Write-Host 'Se solicitó conectar la cuenta de ChatGPT durante setup.'
        }
        else {
            Write-Host 'Siguiente paso: ejecutar agentrelay.cmd login para conectar la cuenta de ChatGPT.'
        }
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

exit 0
