import { ClassDeclaration,
  EnumDeclaration, FunctionDeclaration,
  SourceFile, SyntaxKind, VariableDeclaration,
  InterfaceDeclaration, TypeAliasDeclaration,
   Identifier, 
   MethodDeclaration,
   ParameterDeclaration} from "ts-morph";
import { SourceInfo } from "../../api_reference_crawler/find_references";
   import { BasicPluginInfo } from "../../plugin_utils";
import { getPublicOrServer } from "../../utils";
import { ReferenceDoc } from "../reference_doc";
import { addExportReferences } from "./add_export_references";

export function findStaticExportReferences(
    source: SourceFile,
    sourcePlugin: BasicPluginInfo,
    plugins: Array<BasicPluginInfo>): 
  { [key:string]: ReferenceDoc } {
  const refDocs: { [key: string]: ReferenceDoc } = {};

  const sourceInfo: SourceInfo = {
    sourcePlugin,
    sourceFile: source.getFilePath(),
    publicOrServer: getPublicOrServer(source.getFilePath()),
  }

  const exported = source.getExportedDeclarations();
  console.log(`Getting references for ${exported.size} static exports in file ${source.getFilePath()}`);
  exported.forEach((val) => {
    val.forEach(ed => {
      console.log(`Checking refereneces for export of type ${ed.getKindName()}`);
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
        ident.getImplementations().forEach(imp => imp.getNode());
        name = ident.getSymbol()?.getName();
        console.log('WARN: Not tracking identity symbol ' + ident.getText());
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
