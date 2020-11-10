import fs from 'fs';

export interface PluginInfo {
  name: string;
  missingReadme: number;
  teamOwner: string;
  path: string;
}

function getTeamName(teamTag: string) {
  return teamTag.substring(teamTag.indexOf('/') + 1);
}

export function fillPlugins(codeOwnersFileContents: string, dirPrefix: string, plugins: Array<PluginInfo>) {
  const pathToOwnerMap: { [key: string]: string }  = {};
  codeOwnersFileContents.split('\n').forEach(line => {
    const pieces = line.split(' ');
    let path = '';
    if (line.startsWith("#CC")) {
      path = pieces[1];
    } else if (line.startsWith('/')) {
      path = pieces[0];
    }
    const teamName = getTeamName(pieces[pieces.length - 1]);
    if (teamName.trim() === '' && path !== '') {
      console.warn('Empty team name for path ' + path);
    }
    if (path != '') {
      pathToOwnerMap[path] = teamName;
      fillTeamPlugins(path, dirPrefix, teamName, plugins, true);
    }
  });
}

export function fillTeamPlugins(path: string, dirPrefix: string, teamOwner: string, plugins: Array<PluginInfo> = [], inCodeOwnersFile: boolean = false) {
  try {
    const stats = fs.statSync(dirPrefix + path);
    if (stats.isDirectory()) {
      const isPlugin = fs.existsSync(dirPrefix + path + '/kibana.json');
      if (isPlugin && !path.includes('plugin_functional') && !path.includes('/test/')) {
        const parts = path.split('/');
        const hasReadme = fs.existsSync(dirPrefix + path + '/README.asciidoc') || fs.existsSync(dirPrefix + path + '/README.md');
        plugins.push({
          name: parts[parts.length - 1].trim() !== '' ? parts[parts.length - 1].trim() : parts[parts.length - 2].trim(),
          path,
          missingReadme: hasReadme ? 0 : 1, 
          teamOwner,
        });
      } else {
        const files = fs.readdirSync(dirPrefix + path, { withFileTypes: true });
        for(let i = 0; i < files.length; i++) {
          fillTeamPlugins(path + files[i].name, dirPrefix, teamOwner, plugins);
        }
      }
    }
  } catch (e) {
    if (inCodeOwnersFile) { console.warn(path + ' does not exist'); }
    return plugins;
  }
 }