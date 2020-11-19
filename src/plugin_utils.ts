import { Client } from 'elasticsearch';
import fs from 'fs';
import { PublicAPIDoc } from './api_reference_crawler/types';
import { indexDocs } from './es_utils';

export interface BasicPluginInfo {
  name: string;
  teamOwner: string;
  path: string;
  missingReadme: number;
}

export interface PluginInfo extends BasicPluginInfo {
  hasPublicApi: boolean;
  refCount: number;
}

/**
 * Returns the plugin that the file belongs to.
 * @param path Should be a file that is nested inside a plugin
 * @param plugins A list of plugins to search through.
 */
export function getPluginForPath<I extends BasicPluginInfo = BasicPluginInfo>(
  path: string,
  plugins: Array<I>): I | undefined {
  return plugins.find(plugin => path.includes(plugin.path));
}

export function getPluginFromPath(path: string) {
  const parts = path.split('/');
  while (parts.length > 0) {
    const path = parts.join('/');
    const isPlugin = fs.existsSync(path + '/kibana.json') || path.endsWith('src/core');
    if (isPlugin) {
      return parts[parts.length - 1];
    } else {
      parts.pop();
    }
  }
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

export function extractPluginsFromCodeOwners(
  codeOwnersFileContents: string,
  dirPrefix: string,
  allApiDocs?: Array<PublicAPIDoc>) {
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
      if (allApiDocs) {
        fillTeamPlugins(path, dirPrefix, teamName, plugins, allApiDocs, true);
      } else {
        fillBasicTeamPlugins(path, dirPrefix, teamName, plugins, true);
      }
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
  fillPluginInfo<BasicPluginInfo>(
    path,
    dirPrefix,
    teamOwner,
    plugins,
    inCodeOwnersFile,
    (p: BasicPluginInfo) => p);
 }

export function fillTeamPlugins(
  path: string,
  dirPrefix: string,
  teamOwner: string,
  plugins: Array<PluginInfo> = [],
  allApiDocs: Array<PublicAPIDoc>,
  inCodeOwnersFile: boolean = false) {
  fillPluginInfo<PluginInfo>(
    path,
    dirPrefix,
    teamOwner,
    plugins,
    inCodeOwnersFile,
    (p: BasicPluginInfo) => ({
      ...p, 
    hasPublicApi: allApiDocs.find(a => a.plugin === name) ? true : false,
    refCount: allApiDocs.reduce(
      (sum: number, a) => {
        return a.plugin === name ? sum + (a.refCount || 0) : sum;
      }, 0), }));
 }

 export function getPluginInfoForRepo(
   repoPath: string,
   allApiDocs?: Array<PublicAPIDoc>): Array<PluginInfo> {
  return extractPluginsFromCodeOwners(getCodeOwnersFile(repoPath), repoPath, allApiDocs);
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


export function fillPluginInfo<T extends BasicPluginInfo>(
  path: string,
  dirPrefix: string,
  teamOwner: string,
  plugins: Array<T> = [],
  inCodeOwnersFile: boolean = false,
  getPluginInfo: (info: BasicPluginInfo) => T) {

  const indexOfSrcCore = path.indexOf('src/core'); 
  // Why < 4? Because some deeply nested paths have "src/core" in them that aren't actually
  // inside the top level "src/core" folder and this resulted in ops team being marked the owner
  // of all platform areas.
  if (indexOfSrcCore >= 0 && indexOfSrcCore < 4) {
    if (plugins.find(p => p.name === 'core')) {
      return;
    }
    console.log('team owner of core marked as ' + teamOwner + ' because of file '+ path);
    path = '/src/core/';
  } 

  try {
    const stats = fs.statSync(dirPrefix + path);
    if (stats.isDirectory()) {
      const isPlugin = fs.existsSync(dirPrefix + path + '/kibana.json') || path.indexOf('src/core') >= 0;
      if (isPlugin && !path.includes('plugin_functional') && !path.includes('/test/')) {
        const hasReadme = readmeExists(dirPrefix + path + '/README.asciidoc');
        const name = getPluginNameFromPath(path)

        // There can be multiple lines in code owners that maps to the same plugin. Skip dups.
        if (plugins.find(p => p.name === name)) {
          return;
        }

        plugins.push(getPluginInfo({ name, path, missingReadme: hasReadme ? 0 : 1, teamOwner }));
      } else {
        const files = fs.readdirSync(dirPrefix + path, { withFileTypes: true });
        for(let i = 0; i < files.length; i++) {
          const filePath = path.endsWith('/') ? `${path}${files[i].name}` : `${path}/${files[i].name}`;
          fillPluginInfo(filePath, dirPrefix, teamOwner, plugins, inCodeOwnersFile, getPluginInfo);
        }
      }
    }
  } catch (e) {
    if (inCodeOwnersFile && path.indexOf('*') < 0) { console.warn(path + ' does not exist'); }
    return plugins;
  }
}

export function readmeExists(pluginPath: string) {
 return fs.existsSync(pluginPath + '/README.asciidoc') || fs.existsSync(pluginPath + '/README.md');
}

export function getPluginNameFromPath(path: string) {
  const parts = path.split('/');
  const lastPathName = parts[parts.length - 1].trim() !== '' ?
    parts[parts.length - 1].trim() :
    parts[parts.length - 2].trim();
  return path.indexOf('src/core') >= 0 ? 'core' : lastPathName;
}

/**
 * 
 * @param path
 */
export function getPluginForNestedPath(path: string) {
  const parts = path.split('/');

  while (parts.length > 0) {
    const pluginPath = parts.join('/');
    if (fs.existsSync(pluginPath + '/kibana.json')) {
      return pluginPath;
    } else {
      parts.pop();
    }
  }

  return undefined;
}
