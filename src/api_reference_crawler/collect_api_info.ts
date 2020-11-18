import { PublicAPIDoc, ReferenceDoc } from "./types";
import  elasticsearch from 'elasticsearch';

import { Project, SourceFile } from "ts-morph";
import { BasicPluginInfo, getPluginForNestedPath, getPluginForPath, getPluginInfoForRepo, getPluginNameFromPath, readmeExists } from "../plugin_utils";
import { findStaticExportReferences } from "./find_static_references";
import { getIndexName, indexDocs } from "../es_utils";
import { repo } from "./config";
import { findPluginAPIUsages } from "./find_references";
import { getRelativeKibanaPath } from "../utils";

export async function collectApiInfoForConfig(
  client: elasticsearch.Client,
  repoPath: string,
  tsConfigFilePath: string,
  commitHash: string,
  commitDate: string,
  indexAsLatest: boolean) {
  const project = new Project({ tsConfigFilePath });
  const basicPluginInfo = getPluginInfoForRepo(repoPath);

  const sourceFiles = project.getSourceFiles();
  const allApiDocs: { [key: string]: PublicAPIDoc } = {};

  // Extracting static export usage
  const staticFiles = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('public/index.ts') >= 0 ||
    v.getFilePath().indexOf('server/index.ts') >= 0));

  console.log(`${staticFiles.length} index files found for tsconfig ${tsConfigFilePath}`);

  await collectApiInfoForFiles(
    client,
    commitHash,
    commitDate,
    indexAsLatest,
    staticFiles,
    basicPluginInfo, 
    (source, plugin) => findStaticExportReferences(source, plugin, basicPluginInfo, allApiDocs));

  const staticApiCount = Object.values(allApiDocs).reduce((acc, d) => (d.refCount ? d.refCount : 0) + acc, 0);
  console.log(`Index files expose ${staticApiCount} references`);

  // Extracting dynamic api usage
  const pluginFiles = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('public/plugin.ts') >= 0 ||
    v.getFilePath().indexOf('server/plugin.ts') >= 0));

  console.log(`${pluginFiles.length} plugin files found for tsconfig ${tsConfigFilePath}`);

  collectApiInfoForFiles(
    client,
    commitHash,
    commitDate,
    indexAsLatest,
    pluginFiles,
    basicPluginInfo, 
    (source, plugin) => findPluginAPIUsages(project, source, plugin, basicPluginInfo, allApiDocs));

  const allApiCnt = Object.values(allApiDocs).reduce((acc, d) => (d.refCount ? d.refCount : 0) + acc, 0);
  console.log(`Plugin files expose ${allApiCnt - staticApiCount} references`);

  return allApiDocs;
}

async function collectApiInfoForFiles(
  client: elasticsearch.Client,
  commitHash: string,
  commitDate: string,
  indexAsLatest: boolean,
  files: Array<SourceFile>,
  pluginInfo: Array<BasicPluginInfo>,
  getInfo: (sourceFile: SourceFile, plugin: BasicPluginInfo, apiDocs: { [key: string]: PublicAPIDoc }) => { [key: string]: ReferenceDoc })
  : Promise<{ [key: string]: PublicAPIDoc }>  {
  const apiDocs: { [key: string]: PublicAPIDoc } = {};

  console.log(`Collecting API references from ${files.length} files`);
  for (const source of files) {
    let plugin = getPluginForPath(source.getFilePath(), pluginInfo);

    console.log(`Collecting API references for file ${source.getFilePath()}`);
    if (!plugin) {
      const path = getPluginForNestedPath(source.getFilePath());

      if (!path) {
        console.log(`WARN: No plugin path for file ${source.getFilePath()}`);
        continue;
      }
  
      plugin = {
        name: getPluginNameFromPath(path),
        missingReadme: readmeExists(path) ? 0 : 1,
        teamOwner: '',
        path,
      };

      pluginInfo.push(plugin);
    }

    const refDocs = getInfo(source, plugin, apiDocs);
    const refs= Object.values(refDocs);
    console.log(`Collected ${refs.length} reference docs for plugin ${plugin.name} and file ${source.getFilePath()}`);

    if (refs.length > 0) {
      await indexRefDocs(client, commitHash, commitDate, refs, indexAsLatest);
    }
  };

  return apiDocs;
}

function getRefDocId(commitHash: string, doc: ReferenceDoc) {
  const relativeSourceFile = getRelativeKibanaPath(doc.source.file.path);
  const relativeRefFile = getRelativeKibanaPath(doc.source.file.path);
  return `
    ${commitHash}${doc.source.plugin}${relativeSourceFile.replace('/', '')}${doc.source.name}.${relativeRefFile.replace('/', '')}
  `
}

export async function indexRefDocs(
    client: elasticsearch.Client,
    commitHash: string,
    commitDate: string,
    refDocs: Array<ReferenceDoc>,
    indexAsLatest: boolean) {
  const refsIndexName = getIndexName('references', repo);
  await indexDocs<ReferenceDoc>(
    client,
    refDocs,
    commitHash,
    commitDate,
    refsIndexName,
    (doc: ReferenceDoc) => getRefDocId(commitHash, doc));
  if (indexAsLatest) {
    await indexDocs<ReferenceDoc>(
      client,
      refDocs,
      commitHash,
      commitDate,
      refsIndexName + '-latest',
      (doc: ReferenceDoc) => getRefDocId('', doc));
  }
}