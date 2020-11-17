import { ClassDeclaration,
  EnumDeclaration, FunctionDeclaration,
  Project, SourceFile, SyntaxKind, VariableDeclaration,
  InterfaceDeclaration, TypeAliasDeclaration,
   Identifier, 
   MethodDeclaration,
   ParameterDeclaration} from "ts-morph";
   import { BasicPluginInfo, getPluginForPath } from "../plugin_utils";
import { PublicAPIDoc, ReferenceDoc } from "./service";
import { SourceInfo, getPublicOrServer } from './find_references';
import { addExportReferences } from "./add_export_references";

export function findStaticExportReferences(
    source: SourceFile,
    sourcePlugin: BasicPluginInfo,
    plugins: Array<BasicPluginInfo>,
    apiDocs: { [key: string]: PublicAPIDoc }): 
  { [key:string]: ReferenceDoc } {
  const refDocs: { [key: string]: ReferenceDoc } = {};

  const sourceInfo: SourceInfo = {
    sourcePlugin,
    sourceFile: source.getFilePath(),
    publicOrServer: getPublicOrServer(source.getFilePath()),
  }

  const exported = source.getExportedDeclarations();
  exported.forEach((val) => {
    val.forEach(ed => {
      const preRefCnt = Object.values(refDocs).length; 
      let name: string | undefined = '';

      if ((ed as FunctionDeclaration).getName && (
          (ed as FunctionDeclaration).getName() === 'plugin' ||
          (ed as FunctionDeclaration).getName() === 'config')) {
        return;
      }

      if (ed.getKind() === SyntaxKind.FunctionDeclaration ||
          ed.getKind() === SyntaxKind.ClassDeclaration ||
          ed.getKind() === SyntaxKind.EnumDeclaration ||
          ed.getKind() === SyntaxKind.VariableDeclaration ||
          ed.getKind() === SyntaxKind.InterfaceDeclaration ||
          ed.getKind() === SyntaxKind.TypeAliasDeclaration) {
        name = (ed as TypeAliasDeclaration).getName();
        extractStaticReferencesToEntity(ed as TypeAliasDeclaration, sourceInfo, plugins, refDocs);
      } else if (ed.getKind() === SyntaxKind.Identifier) {
        const ident = ed as Identifier;
        ident.getImplementations().forEach(imp => imp.getNode())
        name = ident.getSymbol()?.getName();
        console.log('WARN: Not tracking identity symbol ' + ident.getText());
        return;
      } else if (ed.getKind() === SyntaxKind.SourceFile) {
        // @ts-ignore
        const file = ed as SourceFile;
        extractSourceFileReferences(file, sourceInfo, plugins);
        console.warn(`WARN: ${sourcePlugin.name}.${sourceInfo.publicOrServer} is exporting a SourceFile. Is this intentional?`);
        const id = `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${name}`;
        apiDocs[id] = {
          plugin: sourceInfo.sourcePlugin.name,
          file: { path: sourceInfo.sourceFile },
          name: file.getFilePath(),
          team: sourceInfo.sourcePlugin.teamOwner,
          type: ed.getKindName(),
          isStatic: true,
          id,
        };
        return;
      } else {
        if (ed.getText().trim() !== '{}') {
          console.warn(`WARN: ${sourcePlugin.name}.${sourceInfo.publicOrServer} has unhandled export of type ${ed.getKindName()}`);
          console.warn('WARN: Text is ', ed.getText());
        }
        return;
      }

      if (name === undefined || name.trim() === '') {
        console.warn(`WARN: ${sourcePlugin.name} has unnamed export`);
        return;
      }

      const refCnt = Object.values(refDocs).length - preRefCnt;
      const id = `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${name}`;
      apiDocs[id] = {
        plugin: sourceInfo.sourcePlugin.name,
        file: { path: sourceInfo.sourceFile },
        name,
        team: sourceInfo.sourcePlugin.teamOwner,
        refCount: refCnt,
        type: ed.getKindName(),
        isStatic: true,
        id
      };
    });
  });

  return refDocs;
}


export function extractStaticReferencesToEntity(
  entity: FunctionDeclaration | ClassDeclaration | VariableDeclaration | EnumDeclaration | MethodDeclaration | ParameterDeclaration | InterfaceDeclaration | TypeAliasDeclaration,
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>,
  refs: { [key: string]: ReferenceDoc }) {
  const identifier = `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${entity.getName()}`;

  const name = entity.getName();
  if (!name) {
    console.error(`${identifier} is missing entity name. Text is ${entity.getText(true)}`);
    return [];
  }
  addExportReferences(entity.findReferences(), entity.getName()!, sourceInfo, plugins, refs, true);
}

function extractSourceFileReferences(
  file: SourceFile,
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>): void {
  file.getReferencingNodesInOtherSourceFiles().forEach(node => {
    const refPlugin = getPluginForPath(node.getSourceFile().getFilePath(), plugins);

    if (refPlugin && refPlugin.name !== sourceInfo.sourcePlugin.name) {
      console.log(`file ${file.getFilePath()} is referenced in ${refPlugin} - ${node.getSourceFile().getFilePath()}`);
    }
  });
}