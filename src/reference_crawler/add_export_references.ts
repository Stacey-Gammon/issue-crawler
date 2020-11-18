import { ReferencedSymbol } from "ts-morph";
import { getApiId } from "../api_crawler/get_api_id";
import { SourceInfo } from "../api_reference_crawler/find_references";
import { BasicPluginInfo, getPluginForPath } from "../plugin_utils";
import { getRelativeKibanaPath } from "../utils";
import { ReferenceDoc } from "./reference_doc";

/**
 * Add all references for the given node into refs.
 * 
 * @param nodeRefs
 * @param name 
 * @param sourceInfo 
 * @param plugins 
 * @param refs 
 * @param isStatic 
 * @param lifecycle 
 */
export function addExportReferences(
  nodeRefs: ReferencedSymbol[],
  name: string,
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>,
  refs: { [key: string]: ReferenceDoc },
  isStatic: boolean,
  lifeCycle?: string): number {
  let refCnt = 0;  
  const id = getApiId({ plugin: sourceInfo.sourcePlugin.name, lifeCycle, publicOrServer: sourceInfo.publicOrServer, name });
  console.log(`Collecting ${nodeRefs.length} references for ${id}`)
  nodeRefs.forEach(node => {
    node.getReferences().forEach(ref => {
      const docId = `${id}.${ref.getSourceFile().getFilePath().replace('/', '')}:${ref.getNode().getStartLineNumber()}`;
      if (refs[docId]) {
        return;
      }

      const refPlugin = getPluginForPath(ref.getSourceFile().getFilePath(), plugins);
      if (refPlugin && refPlugin.name !== sourceInfo.sourcePlugin.name) {
        refCnt++;
        refs[docId] = ({
          source: {
            id,
            plugin: sourceInfo.sourcePlugin.name,
            team: sourceInfo.sourcePlugin.teamOwner,
            file: { path: getRelativeKibanaPath(sourceInfo.sourceFile) },
            isStatic,
            lifecycle: lifeCycle,
            name,
            xpack: sourceInfo.sourceFile.indexOf("x-pack") >= 0
          },
          reference: {
            team: refPlugin.teamOwner,
            plugin: refPlugin.name,
            file: { path: `${getRelativeKibanaPath(ref.getSourceFile().getFilePath())}:${ref.getNode().getStartLineNumber()}` },
            xpack: sourceInfo.sourceFile.indexOf("x-pack") >= 0
          }
        });
      }
    });
  });

  return refCnt;
}