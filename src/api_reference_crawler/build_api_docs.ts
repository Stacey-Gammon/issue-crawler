import { PublicAPIDoc, ReferenceDoc } from "./service";


import { Project, SourceFile } from "ts-morph";
import { BasicPluginInfo, getPluginForNestedPath, getPluginForPath, getPluginInfoForRepo, getPluginNameFromPath, readmeExists } from "../plugin_utils";
import { findPluginAPIUsages } from "./find_references";
import { findStaticExportReferences } from "./find_static_references";

export function collectApiInfo(path: string): { refDocs: Array<ReferenceDoc>, apiDocs: Array<PublicAPIDoc> } {
  // This tsconfig will capture both oss and x-pack code, while the top tsconfig will not capture x-pack.
  return collectApiInfoForConfig(path, `${path}/x-pack/tsconfig.json`);
}

function collectApiInfoForConfig(repoPath: string, tsConfigFilePath: string) {
  const project = new Project({ tsConfigFilePath });

  const basicPluginInfo = getPluginInfoForRepo(repoPath);

  const sourceFiles = project.getSourceFiles();
  const allRefDocs: Array<ReferenceDoc> = [];
  const allApiDocs: Array<PublicAPIDoc> = [];

  // Extracting static export usage
  const staticFiles = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('public/index.ts') >= 0 ||
    v.getFilePath().indexOf('server/index.ts') >= 0));

  console.log(`${staticFiles.length} index files found for tsconfig ${tsConfigFilePath}`);

  const staticApiInfo = collectApiInfoForFiles(
    staticFiles,
    basicPluginInfo, 
    (source, plugin) => findStaticExportReferences(source, plugin, basicPluginInfo));
  allApiDocs.push(...staticApiInfo.apiDocs);
  allRefDocs.push(...staticApiInfo.refDocs);

  // Extracting dynamic api usage
  const pluginFiles = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('public/plugin.ts') >= 0 ||
    v.getFilePath().indexOf('server/plugin.ts') >= 0));

  console.log(`${pluginFiles.length} plugin files found for tsconfig ${tsConfigFilePath}`);

  const { refDocs, apiDocs } = collectApiInfoForFiles(
    pluginFiles,
    basicPluginInfo, 
    (source, plugin) => findPluginAPIUsages(project, source, plugin, basicPluginInfo));
  allApiDocs.push(...apiDocs);
  allRefDocs.push(...refDocs);

  return { apiDocs: allApiDocs, refDocs: allRefDocs };
}

function collectApiInfoForFiles(
  files: Array<SourceFile>,
  pluginInfo: Array<BasicPluginInfo>,
  getInfo: (sourceFile: SourceFile, plugin: BasicPluginInfo) => { apiDocs: Array<PublicAPIDoc>, refDocs: Array<ReferenceDoc> })
  : { apiDocs: Array<PublicAPIDoc>, refDocs: Array<ReferenceDoc> } {
  const allRefDocs: Array<ReferenceDoc> = [];
  const allApiDocs: Array<PublicAPIDoc> = [];

  files.forEach(source => {
    console.log(`Collecting API info for file ${source.getFilePath()}`);

    let plugin = getPluginForPath(source.getFilePath(), pluginInfo);

    if (!plugin) {
      const path = getPluginForNestedPath(source.getFilePath());

      if (!path) {
        console.log(`WARN: No plugin path for file ${source.getFilePath()}`);
        return;
      }
  
      plugin = {
        name: getPluginNameFromPath(path),
        missingReadme: readmeExists(path) ? 0 : 1,
        teamOwner: '',
        path,
      };

      pluginInfo.push(plugin);
    }

    const { apiDocs, refDocs } = getInfo(source, plugin);
    allApiDocs.push(...apiDocs);
    allRefDocs.push(...refDocs);
  });

  return { apiDocs: allApiDocs, refDocs: allRefDocs };
}