import { Node,
  Project, SourceFile, SyntaxKind, Type, PropertyDeclaration } from "ts-morph";
import { BasicPluginInfo } from "../plugin_utils";
import { addExportReferences } from "./add_export_references";
import { ReferenceDoc, PublicAPIDoc } from "./service";

export interface SourceInfo {
  sourcePlugin: BasicPluginInfo;
  sourceFile: string;
  publicOrServer: string;
}

export function getPublicOrServer(path: string) {
  return path.indexOf('/public/') >= 0 ? 'public' : 'server';
}

export function findPluginAPIUsages(
    project: Project,
    source: SourceFile,
    sourcePlugin: BasicPluginInfo,
    plugins: Array<BasicPluginInfo>,
    apiDocs: { [key: string]: PublicAPIDoc }):  {[key:string]: ReferenceDoc } {
  const refDocs: { [key:string]: ReferenceDoc } = {};
  const sourceInfo: SourceInfo = {
    sourcePlugin,
    publicOrServer: getPublicOrServer(source.getFilePath()),
    sourceFile: source.getFilePath(),
  }

  source.getClasses().forEach(c => {
    c.getMethods().forEach(m => {
      const lifecycleFn = m.getName();
      if (lifecycleFn === 'setup' || lifecycleFn === 'start') {
        const ret = m.getReturnTypeNode();
        if (ret) {
          project.getLanguageService().getDefinitions(ret).forEach(d => {
            const decNode = d.getDeclarationNode();
            if (decNode) {
              // Promise has to be handled a bit differently.
              if (Node.isInterfaceDeclaration(decNode) && decNode.getName() === 'Promise') {
                addRefsForPromiseType(ret.getType().getTypeArguments(), sourceInfo, plugins, refDocs, m.getName(), apiDocs);
              } else {
                addPropertyRefsFromNode(decNode, sourceInfo, plugins, refDocs, m.getName(), apiDocs);
              }
            }
          });
        } else {
          const typeText = m.getReturnType().getText().trim();
          const symbolName = m.getReturnType().getSymbol()?.getName();
          if (symbolName && symbolName === 'Promise') {
            addRefsForPromiseType(m.getReturnType().getTypeArguments(), sourceInfo, plugins, refDocs, lifecycleFn, apiDocs);
            return;
          }
          if (typeText !== '{}' &&
              typeText !== 'Promise<void>' &&
              typeText !== 'Promise<{}>' &&
              typeText !== 'void') {
            addRefsForImplicitReturnType(m.getReturnType(), sourceInfo, plugins, refDocs, lifecycleFn, apiDocs);
          }
        }
      }
    });
  });
  return refDocs;
}

function addRefsForPromiseType(
  typeArgs: Type[],
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>,
  refs: { [key: string]: ReferenceDoc },
  lifeCycle: string,
  apiDocs: { [key: string]: PublicAPIDoc }) {
  typeArgs.forEach(tp => {
    addRefsForImplicitReturnType(tp, sourceInfo, plugins, refs, lifeCycle, apiDocs);
  });
}

function addRefsForImplicitReturnType(
    ret: Type,
    sourceInfo: SourceInfo,
    plugins: Array<BasicPluginInfo>,
    refs: { [key: string]: ReferenceDoc },
    lifeCycle: string, 
    apiDocs: { [key: string]: PublicAPIDoc }) {
  try {
    ret.getProperties().forEach(p => {
      p.getDeclarations().forEach(d => {
        if (d.getKind() === SyntaxKind.PropertyAssignment ||
          d.getKind()=== SyntaxKind.ShorthandPropertyAssignment ||
          d.getKind() === SyntaxKind.PropertySignature ||
          d.getKind() === SyntaxKind.PropertyDeclaration) {
          const pa = d as PropertyDeclaration;
          if (pa.getName() === 'Symbol.toStringTag') {
            console.warn('WARN: Not ingesting Symbol.toStringTag. Information may be lost.');
            return;
          }
          if (pa.getName().trim() === '') {
            console.warn('WARN: Not ingesting empty tag. Information may be lost.');
            return;
          }
          const refCnt = addExportReferences(pa.findReferences(), pa.getName(), sourceInfo, plugins, refs, false, lifeCycle);
          const id = `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${lifeCycle}.${pa.getName()}`;
          if (apiDocs[id]) {
            console.warn(`addRefsForImplicitReturnType) Duplicate entry for api doc ${id} with ref Count of ${apiDocs[id].refCount} and new ref count ${refCnt}`);
          }
          console.log(`addRefsForImplicitReturnType) ${id} to ${refCnt}`);
          apiDocs[id] = {
            plugin: sourceInfo.sourcePlugin.name,
            file: { path: sourceInfo.sourceFile },
            name: pa.getName(),
            team: sourceInfo.sourcePlugin.teamOwner,
            refCount: refCnt,
            type: d.getKindName(),
            isStatic: false,
            id: `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${lifeCycle}.${pa.getName()}`,
          };
        } else {
        console.log(`p name: ${p.getName()} declaration of kind ${d.getKindName()}`, d.getText());
        }
      })
    });
  } catch (e) {
    console.error('\nERROR\n', e);
  }
}

function addPropertyRefsFromNode(
    node: Node,
    sourceInfo: SourceInfo,
    plugins: Array<BasicPluginInfo>,
    refs: { [key: string]: ReferenceDoc },
    lifeCycle: string,
    apiDocs: { [key: string]: PublicAPIDoc }) {
  const identifer = `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${lifeCycle}`;  

  if (Node.isInterfaceDeclaration(node)) {
    if (node.getName() === 'Promise') {
      console.warn(`${identifer} return type is a Promise. Is information being lost? Text is`, node.getText());

      node.getTypeParameters().forEach(tp => console.log(`type param is ${tp.getName()}`));
      node.getType().getTypeArguments().forEach(tp => console.log(`type arg txt is ${tp.getText()}`));

      return [];
    }

    node.getProperties().forEach(m => {
      const refCnt = addExportReferences(m.findReferences(), m.getName(), sourceInfo, plugins, refs, false, lifeCycle);
      const id = `${identifer}.${m.getName()}`;
      if (apiDocs[id]) {
        console.warn(`addPropertyRefsFromNode) Duplicate entry for api doc ${id} with ref Count of ${apiDocs[id].refCount} and new ref count ${refCnt}`);
      }
      console.log(`addPropertyRefsFromNode) ${id} to ${refCnt}`);
      apiDocs[id] = {
        plugin: sourceInfo.sourcePlugin.name,
        file: { path: sourceInfo.sourceFile },
        name: m.getName(),
        team: sourceInfo.sourcePlugin.teamOwner,
        refCount: refCnt,
        type: m.getKindName(),
        isStatic: false,
        id,
      };
    });
  } 

  return [];
}
