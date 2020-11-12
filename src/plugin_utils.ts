import { Client } from 'elasticsearch';
import fs from 'fs';
import { PublicAPIDoc } from './api_reference_crawler/service';
import { indexDocs } from './es_utils';

export interface BasicPluginInfo {
  name: string;
  teamOwner: string;
  path: string;
}

export interface PluginInfo extends BasicPluginInfo {
  missingReadme: number;
  hasPublicApi: boolean;
  refCount: number;
}

export function getPluginForPath<I extends BasicPluginInfo = BasicPluginInfo>(filePath: string, plugins: Array<I>): I | undefined {
  return plugins.find(plugin => filePath.includes(plugin.path));
}

export function getKibanaRelativePath(fullFilePath: string) {
  return fullFilePath.substr(fullFilePath.indexOf('kibana/'));
}

export function getTeamOwner<I extends BasicPluginInfo = BasicPluginInfo>(filePath: string, plugins: Array<I>): string {
  const plugin = getPluginForPath(filePath, plugins);
  const owner = plugin ? plugin.teamOwner : 'noOwner';
  if (owner.trim() === '') {
    console.warn('Empty team owner for path ' + filePath);
  }
  return owner;
}

function getTeamName(teamTag: string) {
  return teamTag.substring(teamTag.indexOf('/') + 1);
}

export function getBasicPluginInfo(
  codeOwnersFileContents: string,
  dirPrefix: string): Array<BasicPluginInfo> {
    const plugins: Array<BasicPluginInfo> = [];
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
        fillBasicTeamPlugins(path, dirPrefix, teamName, plugins, true);
      }
    });
    return plugins;
  }

export function getPluginInfo(
  codeOwnersFileContents: string,
  dirPrefix: string,
  allApiDocs: Array<PublicAPIDoc>) {
  const plugins: Array<PluginInfo> = [];
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
      fillTeamPlugins(path, dirPrefix, teamName, plugins, allApiDocs, true);
    }
  });
  return plugins;
}


export function fillBasicTeamPlugins(
  path: string,
  dirPrefix: string,
  teamOwner: string,
  plugins: Array<BasicPluginInfo> = [],
  inCodeOwnersFile: boolean = false) {

  if (path.indexOf('src/core') >= 0) {
    if (plugins.find(p => p.name === 'core')) {
      return;
    }
    path = '/src/core/';
  } 

  try {
    const stats = fs.statSync(dirPrefix + path);
    if (stats.isDirectory()) {
      const isPlugin = fs.existsSync(dirPrefix + path + '/kibana.json') || path.indexOf('src/core') >= 0;
      if (isPlugin && !path.includes('plugin_functional') && !path.includes('/test/')) {
        const parts = path.split('/');
        const hasReadme = fs.existsSync(dirPrefix + path + '/README.asciidoc') || fs.existsSync(dirPrefix + path + '/README.md');
        const name = path.indexOf('src/core') >= 0 ? 'core' :
          parts[parts.length - 1].trim() !== '' ? parts[parts.length - 1].trim() :
          parts[parts.length - 2].trim();

        if (plugins.find(p => p.name === name)) {
          console.warn('WARN: duplicate plugin found ' + name);
          return;
        }
        plugins.push({
          name,
          path,
          teamOwner,
        });
      } else {
        const files = fs.readdirSync(dirPrefix + path, { withFileTypes: true });
        for(let i = 0; i < files.length; i++) {
          fillBasicTeamPlugins(path + files[i].name, dirPrefix, teamOwner, plugins);
        }
      }
    }
  } catch (e) {
    if (inCodeOwnersFile && path.indexOf('*') < 0) { console.warn(path + ' does not exist'); }
    return plugins;
  }
 }

export function fillTeamPlugins(
  path: string,
  dirPrefix: string,
  teamOwner: string,
  plugins: Array<PluginInfo> = [],
  allApiDocs: Array<PublicAPIDoc>,
  inCodeOwnersFile: boolean = false) {

  if (path.indexOf('src/core') >= 0) {
    if (plugins.find(p => p.name === 'core')) {
      return;
    }
    path = '/src/core/';
  } 

  try {
    const stats = fs.statSync(dirPrefix + path);
    if (stats.isDirectory()) {
      const isPlugin = fs.existsSync(dirPrefix + path + '/kibana.json') || path.indexOf('src/core') >= 0;
      if (isPlugin && !path.includes('plugin_functional') && !path.includes('/test/')) {
        const parts = path.split('/');
        const hasReadme = fs.existsSync(dirPrefix + path + '/README.asciidoc') || fs.existsSync(dirPrefix + path + '/README.md');
        const name = path.indexOf('src/core') >= 0 ? 'core' :
          parts[parts.length - 1].trim() !== '' ? parts[parts.length - 1].trim() :
          parts[parts.length - 2].trim();

        if (plugins.find(p => p.name === name)) {
          console.warn('WARN: duplicate plugin found ' + name);
          return;
        }
        plugins.push({
          name,
          path,
          missingReadme: hasReadme ? 0 : 1, 
          teamOwner,
          hasPublicApi: allApiDocs.find(a => a.name === name) ? true : false,
          refCount: allApiDocs.reduce(
            (sum: number, a) => {
              return a.plugin === name ? sum + a.refCount : sum;
            }, 0),
        });
      } else {
        const files = fs.readdirSync(dirPrefix + path, { withFileTypes: true });
        for(let i = 0; i < files.length; i++) {
          fillTeamPlugins(path + files[i].name, dirPrefix, teamOwner, plugins, allApiDocs);
        }
      }
    }
  } catch (e) {
    if (inCodeOwnersFile && path.indexOf('*') < 0) { console.warn(path + ' does not exist'); }
    return plugins;
  }
 }

 export function getPluginInfoForPath(
   path: string,
   allApiDocs: Array<PublicAPIDoc>): Array<PluginInfo> {
  return getPluginInfo(fs.readFileSync(`${path}/.github/CODEOWNERS`, { encoding: "utf8" }), path, allApiDocs);
}

export function getCodeOwnersFile(path: string) {
  return fs.readFileSync(`${path}/.github/CODEOWNERS`, { encoding: "utf8" });
}

export async function indexPluginInfo(
    client: Client,
    plugins: Array<PluginInfo>,
    commitHash: string,
    commitDate: string) {
  indexDocs(client, plugins, commitHash, commitDate, 'kibana-plugins-latest', (p) => p.name);
  indexDocs(client, plugins, commitHash, commitDate, 'kibana-plugins', (p) => `${p.name}${commitHash}`);
}