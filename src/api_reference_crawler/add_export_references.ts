import { ReferencedSymbol } from "ts-morph";
import { BasicPluginInfo, getPluginForPath } from "../plugin_utils";
import { SourceInfo } from "./find_references";
import { ReferenceDoc } from "./service";

export function addExportReferences(
  nodeRefs: ReferencedSymbol[],
  name: string,
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>,
  refs: Array<ReferenceDoc>,
  isStatic: boolean,
  lifecycle?: string): number {
  let refCnt = 0;  
  nodeRefs.forEach(node => {
    node.getReferences().forEach(ref => {
      const refPlugin = getPluginForPath(ref.getSourceFile().getFilePath(), plugins);
      if (refPlugin && refPlugin.name !== sourceInfo.sourcePlugin.name) {
        refCnt++;
        const id = lifecycle ?
          `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${lifecycle}.${name}` :
          `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${name}`;
        // console.log(`Adding ref for ${id} to ${ref.getSourceFile().getFilePath()}`);
        refs.push({
          source: {
            id,
            plugin: sourceInfo.sourcePlugin.name,
            team: sourceInfo.sourcePlugin.teamOwner,
            file: { path: sourceInfo.sourceFile },
            isStatic,
            lifecycle,
            name
          },
          reference: {
            team: refPlugin.teamOwner,
            plugin: refPlugin.name,
            file: { path: ref.getSourceFile().getFilePath() }
          }
        });
      }
    });
  });
  return refCnt;
}