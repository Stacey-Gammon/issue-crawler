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
    plugins: Array<BasicPluginInfo>): { refDocs: Array<ReferenceDoc>, apiDocs: Array<PublicAPIDoc> } {
  const refs: Array<ReferenceDoc> = [];
  const apiDocs: Array<PublicAPIDoc> = [];
  const sourceInfo: SourceInfo = {
    sourcePlugin,
    publicOrServer: getPublicOrServer(source.getFilePath()),
    sourceFile: source.getFilePath(),
  }

  source.getClasses().forEach(c => {
    c.getMethods().forEach(m => {
      const lifecycleFn = m.getName();
      const identifer = `${sourcePlugin.name}.${sourceInfo.publicOrServer}.${lifecycleFn}`;
      if (lifecycleFn === 'setup' || lifecycleFn === 'start') {
        const ret = m.getReturnTypeNode();
        if (ret) {
          project.getLanguageService().getDefinitions(ret).forEach(d => {
            const decNode = d.getDeclarationNode();
            if (decNode) {
              // Promise has to be handled a bit differently.
              if (Node.isInterfaceDeclaration(decNode) && decNode.getName() === 'Promise') {
                apiDocs.push(
                  ...addRefsForPromiseType(ret.getType().getTypeArguments(), sourceInfo, plugins, refs, m.getName()));
              } else {
                apiDocs.push(...addPropertyRefsFromNode(decNode, sourceInfo, plugins, refs, m.getName()));
              }
            }
          });
        } else {
          const typeText = m.getReturnType().getText().trim();
          const symbolName = m.getReturnType().getSymbol()?.getName();
          if (symbolName && symbolName === 'Promise') {
            apiDocs.push(
              ...addRefsForPromiseType(m.getReturnType().getTypeArguments(), sourceInfo, plugins, refs, lifecycleFn));
            return;
          }
          if (typeText !== '{}' &&
              typeText !== 'Promise<void>' &&
              typeText !== 'Promise<{}>' &&
              typeText !== 'void') {
            apiDocs.push(...addRefsForImplicitReturnType(m.getReturnType(), sourceInfo, plugins, refs, lifecycleFn));
          }
        }
      }
    });
  })
  return { refDocs: refs, apiDocs };
}

function addRefsForPromiseType(
  typeArgs: Type[],
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>,
  refs: Array<ReferenceDoc>,
  lifeCycle: string): Array<PublicAPIDoc> {
  const apiDocs: Array<PublicAPIDoc> = [];
  typeArgs.forEach(tp => {
    apiDocs.push(...addRefsForImplicitReturnType(tp, sourceInfo, plugins, refs, lifeCycle));
  });
  return apiDocs;
}

function addRefsForImplicitReturnType(
    ret: Type,
    sourceInfo: SourceInfo,
    plugins: Array<BasicPluginInfo>,
    refs: Array<ReferenceDoc>,
    lifeCycle: string): Array<PublicAPIDoc> {
  const apiDocs: Array<PublicAPIDoc> = [];
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
          apiDocs.push({
            plugin: sourceInfo.sourcePlugin.name,
            file: { path: sourceInfo.sourceFile },
            name: pa.getName(),
            team: sourceInfo.sourcePlugin.teamOwner,
            refCount: refCnt,
            type: d.getKindName(),
            isStatic: false,
            id: `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${lifeCycle}.${pa.getName()}`,
          });
        } else {
        console.log(`p name: ${p.getName()} declaration of kind ${d.getKindName()}`, d.getText());
        }
      })
    });
  } catch (e) {
    console.error('\nERROR\n', e);
  }

  return apiDocs;
}

function addPropertyRefsFromNode(
    node: Node,
    sourceInfo: SourceInfo,
    plugins: Array<BasicPluginInfo>,
    refs: Array<ReferenceDoc>,
    lifeCycle: string): Array<PublicAPIDoc> {
  const identifer = `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${lifeCycle}`;  

  if (Node.isInterfaceDeclaration(node)) {
    if (node.getName() === 'Promise') {
      console.warn(`${identifer} return type is a Promise. Is information being lost? Text is`, node.getText());

      node.getTypeParameters().forEach(tp => console.log(`type param is ${tp.getName()}`));
      node.getType().getTypeArguments().forEach(tp => console.log(`type arg txt is ${tp.getText()}`));

      return [];
    }

    const apiDocs: Array<PublicAPIDoc> = [];
    node.getProperties().forEach(m => {
      const refCnt = addExportReferences(m.findReferences(), m.getName(), sourceInfo, plugins, refs, false, lifeCycle);
      apiDocs.push({
        plugin: sourceInfo.sourcePlugin.name,
        file: { path: sourceInfo.sourceFile },
        name: m.getName(),
        team: sourceInfo.sourcePlugin.teamOwner,
        refCount: refCnt,
        type: m.getKindName(),
        isStatic: false,
        id: `${identifer}.${m.getName()}`,
      });
    });
    return apiDocs;
  } 

  return [];
}
