# Aplica las migraciones SQL en una base NUEVA (p. ej. Supabase), una sola vez y en el orden verificado.
# Se detiene en el primer error. Requiere Docker Desktop abierto (usa psql dentro de un contenedor).
# Uso (PowerShell, desde apps\api):   .\db\migrar-produccion.ps1
# Toma la cadena de la variable DATABASE_URL o, si no existe, te la pide. No se guarda en ningun archivo.
# (Archivo solo ASCII a proposito: Windows PowerShell 5.1 rompe los acentos sin BOM.)

$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot 'migrations'

$url = $env:DATABASE_URL
if (-not $url) { $url = Read-Host 'Pega tu DATABASE_URL (la de Supabase, con la contrasena)' }
$url = "$url".Trim().Trim('"').Trim("'")
if ($url -notmatch '^postgres(ql)?://') {
  throw 'Lo pegado no es una cadena de conexion. Debe empezar por postgresql:// (no escribas $url: pega la cadena completa con tu contrasena).'
}
if ($url -match '\[|\]|TU_CONTRASE') { throw 'La cadena aun tiene corchetes o el texto TU_CONTRASE...: reemplazalo por tu contrasena real.' }

# Orden: alfabetico, salvo que 014_ai_interaction.sql debe ir ANTES de 013_ai_validation.sql
# (hay numeros repetidos en las migraciones y, en orden alfabetico, 013 y 017 fallan en una base vacia).
$files = [System.Collections.Generic.List[string]]::new()
$names = [string[]](Get-ChildItem $dir -Filter *.sql | ForEach-Object { $_.Name })
[System.Array]::Sort($names, [System.StringComparer]::Ordinal)
foreach ($n in $names) { $files.Add($n) }
$files.Remove('013_ai_validation.sql') | Out-Null
$files.Insert($files.IndexOf('014_ai_interaction.sql') + 1, '013_ai_validation.sql')

# Seguridad: si la base ya tiene tablas de OmniDesk, no repetir (001 y otras no son re-ejecutables).
$existe = docker run --rm postgres:16 psql "$url" -tA -c "select to_regclass('public.users') is not null;"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar a la base.' }
if ("$existe".Trim() -eq 't') { throw 'La base ya tiene la tabla users: parece migrada. No se ejecuta nada.' }

Write-Host ("Se aplicaran {0} migraciones:" -f $files.Count)
$files | ForEach-Object { Write-Host "  $_" }
Write-Host ""
foreach ($file in $files) {
  Write-Host ">> $file" -ForegroundColor Cyan
  docker run --rm -v "${dir}:/migrations:ro" postgres:16 psql "$url" -v ON_ERROR_STOP=1 --single-transaction -q -f "/migrations/$file"
  if ($LASTEXITCODE -ne 0) { throw "Fallo $file. Se detuvo aqui; avisame el mensaje de error." }
}

Write-Host ""
Write-Host "Listo. Tablas creadas:" -ForegroundColor Green
docker run --rm postgres:16 psql "$url" -tA -c "select count(*) from information_schema.tables where table_schema='public';"
