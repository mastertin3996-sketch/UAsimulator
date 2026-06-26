$env:DATABASE_URL = (Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL' }) -replace 'DATABASE_URL="?([^"]+)"?','$1'
npx ts-node --compiler-options '{\"module\":\"CommonJS\"}' run-ticks.ts
