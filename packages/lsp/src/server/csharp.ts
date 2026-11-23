/**
 * C# Language Server (csharp-ls)
 * Uses dotnet tool install
 */

import { dotnetToolServer } from './dotnet-tool'

export const CsharpServer = dotnetToolServer({
  id: 'csharp',
  tool: 'csharp-ls',
  extensions: ['.cs'],
  rootMarkers: ['.sln', '.csproj', 'global.json'],
})
