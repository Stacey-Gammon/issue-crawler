
import git from "simple-git/promise";
import  elasticsearch from 'elasticsearch';
import  { elasticsearchEnv, codeRepos } from './config';
import fs from 'fs';
import path from 'path';
import find from 'find';
import sloc from 'sloc';
import tmp from 'tmp';

const client = new elasticsearch.Client(elasticsearchEnv);

const fileExtensions = [".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss"];

function findFiles(dir: string) {
  return new Promise<string[]>(resolve => {
    find.file(dir, files => {
      resolve(files);
    });
  });
}

interface AnalyzedFile {
  hasAngular: boolean;
  hasUiPublic: boolean;
  ext: string;
  filename: string;
  isTestFile: boolean;
  dirs: string;
  fullFilename: string;
  anyCount: number;
  teamOwner: string;
  loc: number;
  anyCountOverLoc: number;
}

interface FileDocAttributes extends AnalyzedFile {
  commitHash: string;
  commitDate: string,
  repo: string,
  checkout: string,
  indexDate: string;
};

const plugins: Array<PluginDoc> = [];

export function getTeamOwner(filePath: string, owners: { [key: string]: string }): string {
  const prefix = Object.keys(owners).find(prefix => filePath.includes(prefix));
  const owner = prefix ? owners[prefix] : 'noOwner';
  if (owner.trim() === '') {
    console.warn('Empty team owner for path ' + filePath);
  }
  return owner;
}

function getTeamName(teamTag: string) {
  return teamTag.substring(teamTag.indexOf('/') + 1);
}

export function processCodeOwnersFile(codeOwnersFile: string, dirPrefix: string): { [key: string]: string } {
  const pathToOwnerMap: { [key: string]: string }  = {};
  codeOwnersFile.split('\n').forEach(line => {
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

      if (path.includes('/plugins/') && !path.includes('*')) {
        const pathParts = path.split('/');
        let pluginName = pathParts[pathParts.length - 1];
        if (pluginName.trim() === '') {
          pluginName = pathParts[pathParts.length - 2];
        }
        const hasReadme = fs.existsSync(dirPrefix + path + 'README.asciidoc') || fs.existsSync(dirPrefix + path + 'README.md') || path.includes('**');

        plugins.push({ name: pluginName, missingReadme: hasReadme ? 0 : 1, teamOwner: teamName });
      }
    }
  });
  return pathToOwnerMap;
}

function filterFile(file: string) {
  return (
    fileExtensions.indexOf(path.extname(file)) !== -1 &&
    !file.includes('node_modules') &&
    !file.includes('optimize/bundles') &&
    !file.includes('x-pack/build') &&
    !file.includes('target/')
  );
}

function  isTestFile(file: string) {

}

async function analyze(localPath: string) {
  console.log(`Analyzing ${localPath}`);

  const codeOwners = processCodeOwnersFile(fs.readFileSync(`${localPath}/.github/CODEOWNERS`, { encoding: "utf8" }), localPath);
  
  console.log('plugins info is ', );
  console.table(plugins);
  indexPluginInfo();

  const rootDirDepth = localPath.split(path.sep).length;
  const files = await findFiles(localPath);
  return files
    .filter(file => filterFile(file))
    .map(file => {
      const code = fs.readFileSync(file, { encoding: "utf8" });
      const dirs = file.split(path.sep).slice(rootDirDepth);
      const filename = dirs.pop();
      if (filename) {
        const ext = path.extname(filename).slice(1);
        
        const angularTakeaways = [
          "uiModules",
          ".directive(",
          ".service(",
          ".controller(",
          "$scope",
          "Private(",
          "dangerouslyGetActiveInjector",
        ];

        const teamOwner = getTeamOwner(file, codeOwners);
        const anyCount = (code.match(/: any/g) || []).length;
        const loc = (code.match(/\n/g) || []).length;

        const attributes: AnalyzedFile = {
          ...sloc(code, ext),
          isTestFile:
            dirs.includes("__tests__") || filename.indexOf(".test.") > -1 || teamOwner === 'kibana-qa' || dirs.includes('test') || dirs.includes('test_utils'),
          ext,
          filename,
          teamOwner,
          anyCount,
          loc,
          anyCountOverLoc: anyCount/loc,
          dirs: dirs.join(path.sep),
          fullFilename: [...dirs, filename].join(path.sep),
          hasAngular: angularTakeaways.some(searchString =>
            code.includes(searchString)
          ),
          hasUiPublic: code.includes("from 'ui/")
        };

        //console.log(`${file} is owned by ${teamOwner} and has ${anyCount} anys`);
        return attributes;
      }
    });
}

function getIndexName(repo: string) {
  const owner = repo.split("/")[0];
  const repoName = repo.split("/")[1];
  return `code-${owner}-${repoName}`;
}

async function alreadyIndexed(repo: string, commitHash: string) {
  const entries = await client.search({
    index: getIndexName(repo),
    ignoreUnavailable: true,
    size: 0,
    body: {
      query: {
        bool: {
          filter: [{ match: { commitHash } }, { match: { repo } }]
        }
      }
    }
  });

  return entries.hits.total > 0;
}

const getDocument = (commitHash: string, commitDate: string, repo: string, checkout: string) => (file: AnalyzedFile | undefined) => {
  if (file) {
    return {
      ...file,
      commitHash,
      commitDate,
      repo,
      checkout,
      indexDate: new Date().toISOString()
    };
  }
};

async function indexFiles(files:  Array<FileDocAttributes | undefined>, repo: string) {
  console.log(`Indexing data from ${files.length} files`);
  const body: any[] = [];
  files.forEach(file => {
    if (file) {
      body.push({ index: { _index: getIndexName(repo), _type: "_doc" } });
      body.push(file);
    }
  });
  try {
    await client.bulk({
      body
    });
  } catch (e) {
    console.error(e);
  }
}

interface PluginDoc {
  name: string;
  missingReadme: number;
  teamOwner: string;
}

async  function indexPluginInfo() {
  console.log(`Indexing data from ${plugins.length} plugins`);
  const body: any[] = [];
  plugins.forEach(plugin => {
    if (plugin) {
      body.push({ index: { _index: 'kibana-plugins', _type: "_doc",  _id: plugin.name } });
      body.push(plugin);
    }
  });
  try {
    await client.bulk({
      body
    });
  } catch (e) {
    console.error(e);
  }
}


export async function crawlCode() {
  for (const { repo, checkouts } of codeRepos) {
    const tmpDir = { name: '/Users/gammon/Elastic/kibana' };//tmp.dirSync();
    console.log(`Processing ${repo}, using ${tmpDir.name}`);
    const currentGit = git(tmpDir.name);
    try {
      console.log(`Cloning ${repo}...`);
      //await currentGit.clone(`https://github.com/${repo}.git`, tmpDir.name);
      console.log(`Clone completed`);
      for (const checkout of checkouts) {
        console.log(`Indexing current state of ${checkout}`);
        await currentGit.checkout(checkout);
        const commitHash = await currentGit.raw(["rev-parse", "HEAD"]);
        const commitDate = new Date(
          await currentGit.raw(["log", "-1", "--format=%cd"])
        ).toISOString();
        if (await alreadyIndexed(repo, commitHash)) {
          console.log(
            `${repo} ${checkout} (${commitHash}) already indexed, skipping`
          );
          continue;
        }
        let files: Array<FileDocAttributes | undefined> = [];
        
        const analyzedFiles = await analyze(tmpDir.name);
        
        for (let i = 0; i < analyzedFiles.length; i++) {
          const file = getDocument(commitHash, commitDate, repo, checkout)(analyzedFiles[i]);
          files.push(file);
          if (files.length === 500) {
            await indexFiles(files, repo);
            files = [];
          }
        }
        await indexFiles(files, repo);
      }
    } catch (e) {
      console.log(`Indexing ${repo} failed: `, e);
    }
   // tmpDir.removeCallback();
  }
}
