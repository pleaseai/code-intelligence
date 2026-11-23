/**
 * F# Language Server (fsautocomplete)
 * Uses dotnet tool install
 */

import { dotnetToolServer } from './dotnet-tool'

export const FsharpServer = dotnetToolServer({
  id: 'fsharp',
  tool: 'fsautocomplete',
  extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
  rootMarkers: ['.sln', '.fsproj', 'global.json'],
})
