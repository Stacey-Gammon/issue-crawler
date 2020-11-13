import { PublicAPIDoc, ReferenceDoc } from "./service";


import { Project } from "ts-morph";
import { getBasicPluginInfo, getCodeOwnersFile, getPluginForPath } from "../plugin_utils";
import { findPluginAPIUsages } from "./find_references";
import { findStaticExportReferences } from "./find_static_references";

export function collectApiInfo(path: string): { refDocs: Array<ReferenceDoc>, apiDocs: Array<PublicAPIDoc> } {
  const project = new Project({ tsConfigFilePath: `${path}/tsconfig.json` });

  const codeOwnersFile = getCodeOwnersFile(path);
  const basicPluginInfo = getBasicPluginInfo(codeOwnersFile, path)
  const sourceFiles = project.getSourceFiles();
  const allRefDocs: Array<ReferenceDoc> = [];
  const allApiDocs: Array<PublicAPIDoc> = [];

  // Extracting static export usage
  const files = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('public/index.ts') >= 0 ||
    v.getFilePath().indexOf('server/index.ts') >= 0));

  console.log(`${files.length} index files found`);

  files.forEach(source => {
    const pluginForSourceFile = getPluginForPath(source.getFilePath(), basicPluginInfo);
    if (!pluginForSourceFile) {
      console.error(`Missing plugin for file ${source.getFilePath()}`);
      return;
    }
    const { refDocs, apiDocs } = findStaticExportReferences(source, pluginForSourceFile, basicPluginInfo);
    allApiDocs.push(...apiDocs);
    allRefDocs.push(...refDocs);
  });

  // Extracting dynamic api usage
  const pluginFiles = sourceFiles.filter((v, i) => (
    v.getFilePath().indexOf('public/plugin.ts') >= 0 ||
    v.getFilePath().indexOf('server/plugin.ts') >= 0));

  console.log(`${pluginFiles.length} plugin files found`);

  pluginFiles.forEach(source => {
    const pluginForSourceFile = getPluginForPath(source.getFilePath(), basicPluginInfo);
    if (!pluginForSourceFile) {
      console.error(`Missing plugin for file ${source.getFilePath()}`);
      return;
    }

    const { refDocs, apiDocs } = findPluginAPIUsages(project, source, pluginForSourceFile, basicPluginInfo);
    allApiDocs.push(...apiDocs);
    allRefDocs.push(...refDocs);
  });

  return { apiDocs: allApiDocs, refDocs: allRefDocs };
}