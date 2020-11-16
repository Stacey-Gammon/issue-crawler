
import git from "simple-git/promise";
import  elasticsearch from 'elasticsearch';
import  { elasticsearchEnv, codeRepos } from '../config';
import fs from 'fs';
import path from 'path';
import find from 'find';
import sloc from 'sloc';
import tmp from 'tmp';
import { BasicPluginInfo, getPluginInfoForRepo, getCodeOwnersFile, getTeamOwner, PluginInfo } from "../plugin_utils";
import { getIndexName, indexDocs } from "../es_utils";
import { repo, checkoutDates } from './config';
import { checkoutRepo, getCommitDate, getCommitHash } from "../git_utils";

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

function filterFile(file: string) {
  return (
    fileExtensions.indexOf(path.extname(file)) !== -1 &&
    !file.includes('node_modules') &&
    !file.includes('optimize/bundles') &&
    !file.includes('x-pack/build') &&
    !file.includes('target/')
  );
}


async function analyze(localPath: string, plugins: Array<BasicPluginInfo>) {
  console.log(`Analyzing ${localPath}`);

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

async function alreadyIndexed(repo: string, commitHash: string) {
  const entries = await client.search({
    index: getIndexName('code', repo),
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

async function indexFiles(files:  Array<FileDocAttributes | undefined>, repo: string, commitHash: string, commitDate: string) {
  await indexDocs<FileDocAttributes | undefined>(
    client,
    files,
    commitHash,
    commitDate,
    getIndexName('code', repo),
    (doc) => doc ? `${doc.commitHash}${doc.fullFilename.replace('/', '')}` : '');
  
  await indexDocs<FileDocAttributes | undefined>(
    client,
    files,
    commitHash,
    commitDate,
    `${getIndexName('code', repo)}-latest`,
    (doc) => doc ? `${doc.fullFilename.replace('/', '')}` : '');
}

export async function crawlCode() {
  const { repoPath, currentGit } = await checkoutRepo(repo, '/Users/gammon/Elastic/kibana');
  try {
    for (const date of checkoutDates) {
      const checkout = date ? `master@${date}` : 'master';
      await currentGit.checkout(checkout);
      console.log(`Indexing current state of master with ${checkout}`);

      const commitHash = await getCommitHash(currentGit);
      const commitDate = await getCommitDate(currentGit);
      // if (await alreadyIndexed(repo, commitHash)) {
      //   console.log(
      //     `${repo} ${checkout} (${commitHash}) already indexed, skipping`
      //   );
      //   continue;
      // }

      const plugins = getPluginInfoForRepo(repoPath)

      let files: Array<FileDocAttributes | undefined> = [];
      
      const analyzedFiles = await analyze(repoPath, plugins);
      
      for (let i = 0; i < analyzedFiles.length; i++) {
        const file = getDocument(commitHash, commitDate, repo, checkout)(analyzedFiles[i]);
        files.push(file);
        if (files.length === 500) {
          await indexFiles(files, repo, commitHash, commitDate);
          files = [];
        }
      }
      await indexFiles(files, repo, commitHash, commitDate);
    }
  } catch (e) {
    console.log(`Indexing ${repo} failed: `, e);
  }
}
