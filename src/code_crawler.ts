
import git from "simple-git/promise";
import  elasticsearch from 'elasticsearch';
import  { elasticsearchEnv, codeRepos } from './config';
import fs from 'fs';
import path from 'path';
import find from 'find';
import sloc from 'sloc';
import tmp from 'tmp';
import { fillPlugins, PluginInfo } from "./fill_plugins";

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

export function getTeamOwner(filePath: string, plugins: Array<PluginInfo>): string {
  const plugin = plugins.find(plugin => filePath.includes(plugin.path));
  const owner = plugin ? plugin.teamOwner : 'noOwner';
  if (owner.trim() === '') {
    console.warn('Empty team owner for path ' + filePath);
  }
  return owner;
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


async function analyze(localPath: string) {
  console.log(`Analyzing ${localPath}`);

  const plugins: Array<PluginInfo> = [];
  fillPlugins(fs.readFileSync(`${localPath}/.github/CODEOWNERS`, { encoding: "utf8" }), localPath, plugins);
  console.table(plugins);
  indexPluginInfo(plugins);

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

        const teamOwner = getTeamOwner(file, plugins);
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
  let body: any[] = [];
  files.forEach(file => {
    if (file) {
      body.push({ index: { _index: getIndexName(repo), _type: "_doc", _id: `${file.commitHash}${file.fullFilename.replace('/', '')}` } });
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

  body = [];
  files.forEach(file => {
    if (file) {
      body.push({ index: { _index: `latest-${getIndexName(repo)}`, _type: "_doc", _id: `${file.fullFilename.replace('/', '')}` } });
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

async  function indexPluginInfo(plugins: Array<PluginInfo>) {
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
        //await currentGit.checkout(checkout);
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
