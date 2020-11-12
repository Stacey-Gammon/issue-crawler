import { ClassDeclaration, Node,
  EnumDeclaration, FunctionDeclaration, MethodDeclaration,
  Project, SourceFile, SyntaxKind, VariableDeclaration,
  InterfaceDeclaration, ReferencedSymbol,
   ParameterDeclaration, TypeAliasDeclaration,
   Identifier, Type, TypeNode, PropertySignature } from "ts-morph";
import { BasicPluginInfo, getPluginForPath, PluginInfo } from "../plugin_utils";
import { ReferenceDoc, PublicAPIDoc } from "./service";

interface SourceInfo {
  sourcePlugin: BasicPluginInfo;
  sourceFile: string;
  publicOrServer: string;
}

function getPublicOrServer(path: string) {
  return path.indexOf('/public/') >= 0 ? 'public' : 'server';
}

export function findStaticExportReferences(source: SourceFile, sourcePlugin: BasicPluginInfo, plugins: Array<BasicPluginInfo>): 
  { refDocs: Array<ReferenceDoc>, apiDocs: Array<PublicAPIDoc> } {
  const refs: Array<ReferenceDoc> = [];
  const apiDocs: Array<PublicAPIDoc> = [];

  const sourceInfo: SourceInfo = {
    sourcePlugin,
    sourceFile: source.getFilePath(),
    publicOrServer: getPublicOrServer(source.getFilePath()),
  }

  const exported = source.getExportedDeclarations();
  exported.forEach((val) => {
    val.forEach(ed => {
      const preRefCnt = refs.length; 
      let name: string | undefined = '';

      if ((ed as FunctionDeclaration).getName && (
          (ed as FunctionDeclaration).getName() === 'plugin' ||
          (ed as FunctionDeclaration).getName() === 'config')) {
        console.log('Skipping plugin and config exports, they are special and not part of the public API');
        return;
      }

      if (ed.getKind() === SyntaxKind.FunctionDeclaration) {
        name = (ed as FunctionDeclaration).getName();
        refs.push(...extractStaticReferencesToEntity(ed as FunctionDeclaration, sourceInfo, plugins));
      } else if (ed.getKind() === SyntaxKind.ClassDeclaration) {
        name = (ed as ClassDeclaration).getName();
        refs.push(...extractStaticReferencesToEntity(ed as ClassDeclaration, sourceInfo, plugins));
      } else if (ed.getKind() === SyntaxKind.EnumDeclaration) {
        name = (ed as EnumDeclaration).getName();
        refs.push(...extractStaticReferencesToEntity(ed as EnumDeclaration, sourceInfo, plugins));
      } else if (ed.getKind() === SyntaxKind.VariableDeclaration) {
        name = (ed as VariableDeclaration).getName();
        refs.push(...extractStaticReferencesToEntity(ed as VariableDeclaration, sourceInfo, plugins));
      } else if (ed.getKind() === SyntaxKind.InterfaceDeclaration) {
        name = (ed as InterfaceDeclaration).getName();
        refs.push(...extractStaticReferencesToEntity(ed as InterfaceDeclaration, sourceInfo, plugins));
      } else if (ed.getKind() === SyntaxKind.TypeAliasDeclaration) {
        name = (ed as TypeAliasDeclaration).getName();
        refs.push(...extractStaticReferencesToEntity(ed as TypeAliasDeclaration, sourceInfo, plugins));
      } else if (ed.getKind() === SyntaxKind.Identifier) {
        const ident = ed as Identifier;
        ident.getImplementations().forEach(imp => imp.getNode())
      } else if (ed.getKind() === SyntaxKind.SourceFile) {
        // @ts-ignore
        const file = ed as SourceFile;
        extractSourceFileReferences(file, sourceInfo, plugins);
        console.warn(`WARN: ${sourcePlugin.name}.${sourceInfo.publicOrServer} is exporting a SourceFile. Is this intentional?`);
        apiDocs.push({
          plugin: sourceInfo.sourcePlugin.name,
          file: { path: sourceInfo.sourceFile },
          name: file.getFilePath(),
          team: sourceInfo.sourcePlugin.teamOwner,
          refCount: -1, // -1 means I couldn't count it.
          type: ed.getKindName(),
          isStatic: true
        });
        return;
      } else {
        if (ed.getText().trim() !== '{}') {
          console.warn(`WARN: ${sourcePlugin.name}.${sourceInfo.publicOrServer} has unhandled export of type ${ed.getKindName()}`);
          console.warn('WARN: Text is ', ed.getText());
        }
        return;
      }

      if (name === undefined) {
        console.warn(`WARN: ${sourcePlugin.name} has unnamed export`);
        return;
      }

      const refCnt = refs.length - preRefCnt;
      apiDocs.push({
        plugin: sourceInfo.sourcePlugin.name,
        file: { path: sourceInfo.sourceFile },
        name,
        team: sourceInfo.sourcePlugin.teamOwner,
        refCount: refCnt,
        type: ed.getKindName(),
        isStatic: true
      });
    });
  });

  return { refDocs: refs, apiDocs };
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
                apiDocs.push(...addRefsForPromiseType(ret, sourceInfo, plugins, refs, m.getName()));
              } else {
                apiDocs.push(...addPropertyRefsFromNode(decNode, sourceInfo, plugins, refs, m.getName()));
              }
            }
          });
        } else {
          const typeText = m.getReturnType().getText().trim();
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
  node: TypeNode,
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>,
  refs: Array<ReferenceDoc>,
  lifeCycle: string): Array<PublicAPIDoc> {
  const apiDocs: Array<PublicAPIDoc> = [];
  node.getType().getTypeArguments().forEach(tp => {
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

  // ret.getTypeArguments().forEach(tp => {
  //   console.log('Adding refs for type arguments... for ' + ret.getSymbol()?.getName());
  //   //apiDocs.push(...addRefsForImplicitReturnType(tp, sourceInfo, plugins, refs, lifeCycle));
  // });

  ret.getProperties().forEach(p => {
    p.getDeclarations().forEach(d => {
      if (d.getKind() === SyntaxKind.PropertyAssignment ||
         d.getKind()=== SyntaxKind.ShorthandPropertyAssignment ||
         d.getKind() === SyntaxKind.PropertySignature) {
        const pa = d as PropertySignature;
        const refCnt = addExportReferences(pa.findReferences(), pa.getName(), sourceInfo, plugins, refs, false, lifeCycle);
        apiDocs.push({
          plugin: sourceInfo.sourcePlugin.name,
          file: { path: sourceInfo.sourceFile },
          name: pa.getName(),
          team: sourceInfo.sourcePlugin.teamOwner,
          refCount: refCnt,
          type: d.getKindName(),
          isStatic: false
        });
      } else {
       console.log(`p name: ${p.getName()} declaration of kind ${d.getKindName()}`, d.getText());
      }
    })
  });

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
        isStatic: false
      });
    });
    return apiDocs;
  } 

  return [];
}

function extractSourceFileReferences(
  file: SourceFile,
  sourceInfo: SourceInfo,
  plugins: Array<BasicPluginInfo>): void {
  file.getReferencingNodesInOtherSourceFiles().forEach(node => {
    const refPlugin = getPluginForPath(node.getSourceFile().getFilePath(), plugins);
    if (refPlugin?.name !== sourceInfo.sourcePlugin.name) {
      console.log(`file ${file.getFilePath()} is refernced in ${refPlugin} - ${node.getSourceFile().getFilePath()}`);
    }
  });
}

export function extractStaticReferencesToEntity(
    entity: FunctionDeclaration | ClassDeclaration | VariableDeclaration | EnumDeclaration | MethodDeclaration | ParameterDeclaration | InterfaceDeclaration | TypeAliasDeclaration,
    sourceInfo: SourceInfo,
    plugins: Array<BasicPluginInfo>): Array<ReferenceDoc> {
  const refs: Array<ReferenceDoc> = [];

  const identifier = `${sourceInfo.sourcePlugin.name}.${sourceInfo.publicOrServer}.${entity.getName()}`;
  const name = entity.getName();
  if (!name) {
    console.error(`${identifier} is missing entity name. Text is ${entity.getText(true)}`);
    return [];
  }
  addExportReferences(entity.findReferences(), entity.getName()!, sourceInfo, plugins, refs, true);
  return refs;
}

function addExportReferences(
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
      if (refPlugin && refPlugin?.name !== sourceInfo.sourcePlugin.name) {
        refCnt++;
        refs.push({
          source: {
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