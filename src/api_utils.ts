import { Node, Project, PropertyDeclaration, ReferencedSymbol, SourceFile, SyntaxKind, Type } from "ts-morph";
import { getApiId } from "./api_crawler/get_api_id";
import { BasicPluginInfo, getPluginForNestedPath, getPluginForPath, getPluginInfoForRepo, getPluginNameFromPath, getTeamOwner, readmeExists } from "./plugin_utils";
import { getPublicOrServer } from "./utils";

export interface Api {
  id: string;
  plugin: string;
  file: { path: string };
  isStatic: boolean;
  type: string;
  name: string;
  node: { findReferences: () => ReferencedSymbol[] }
  team: string,
}

export interface ImplicitApiOpts {
  returnType: Type;
  file: string;
  lifeCycle: string;
  apis: { [key: string]: Api }
  plugin: BasicPluginInfo;
}

export function getStaticApi(
  files: Array<SourceFile>,
  plugins: Array<BasicPluginInfo>): { [key: string]: Api } {
  const apis: { [key: string]: Api } = {};
  console.log(`Collecting static apis from ${files.length} files...`);

  collectApiInfoForFiles(
    files,
    plugins, 
    (source, plugin) => addStaticApis(source, plugin, apis));

  console.log(`Collected ${Object.values(apis).length} apis.`);
  return apis;
}

export function getContractApi(
    project: Project,
    files: Array<SourceFile>,
    plugins: Array<BasicPluginInfo>): { [key: string]: Api } {
  const apis: { [key: string]: Api } = {};

  console.log(`Collecting contract apis from ${files.length} files...`);

  collectApiInfoForFiles(
    files,
    plugins, 
    (source, plugin) => addContractApis(project, source, plugin, apis));

  console.log(`Plugin files expose ${Object.values(apis).length} apis`);

  return apis;
}


async function collectApiInfoForFiles(
  files: Array<SourceFile>,
  pluginInfo: Array<BasicPluginInfo>,
  getInfo: (sourceFile: SourceFile, plugin: BasicPluginInfo, apis: { [key: string]: Api }) => void) {
  const apis: { [key: string]: Api } = {};

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

    getInfo(source, plugin, apis);
  };

  return apis;
}

function addImplicitApi({ file, returnType, plugin, lifeCycle, apis }: ImplicitApiOpts) {
  try {
    const publicOrServer = getPublicOrServer(file);
    returnType.getProperties().forEach(p => {
      p.getDeclarations().forEach(d => {
        if (d.getKind() === SyntaxKind.PropertyAssignment ||
            d.getKind()=== SyntaxKind.ShorthandPropertyAssignment ||
            d.getKind() === SyntaxKind.PropertySignature ||
            d.getKind() === SyntaxKind.PropertyDeclaration) {
          const pa = d as PropertyDeclaration;
          if (pa.getName() === 'Symbol.toStringTag') {
            console.warn('WARN: Not ingesting API for Symbol.toStringTag. Information may be lost.');
            return;
          }
          if (pa.getName().trim() === '') {
            console.warn('WARN: Not ingesting empty tag. Information may be lost.');
            return;
          }
          const id = getApiId({ plugin: plugin.name, publicOrServer, lifeCycle, name: pa.getName()});
          apis[id] = {
            plugin: plugin.name,
            file: { path: file },
            name: pa.getName(),
            type: d.getKindName(),
            team: plugin.teamOwner,
            isStatic: false,
            id,
            node: pa
          };
        } else {
          console.log(`p name: ${p.getName()} declaration of kind ${d.getKindName()}`, d.getText());
        }
      });
    });
  } catch (e) {
    console.error('\nERROR\n', e);
  }
}

export function addContractApis(
  project: Project,
  source: SourceFile,
  plugin: BasicPluginInfo,
  apis: { [key: string]: Api }) {
  const file = source.getFilePath();
  source.getClasses().forEach(c => {
    c.getMethods().forEach(m => {
      const lifeCycle = m.getName();
      if (lifeCycle === 'setup' || lifeCycle === 'start') {
        const ret = m.getReturnTypeNode();
        if (ret) {
          project.getLanguageService().getDefinitions(ret).forEach(d => {
            const decNode = d.getDeclarationNode();
            if (decNode) {
              // Promise has to be handled a bit differently.
              if (Node.isInterfaceDeclaration(decNode) && decNode.getName() === 'Promise') {
                addRefsForPromiseType(ret.getType().getTypeArguments(), plugin, file, lifeCycle, apis);
               } else {
                addApiFromNode(decNode, plugin, file, lifeCycle, apis);
              }
            }
          });
        } else {
          const typeText = m.getReturnType().getText().trim();
          const symbolName = m.getReturnType().getSymbol()?.getName();
          if (symbolName && symbolName === 'Promise') {
            addRefsForPromiseType(m.getReturnType().getTypeArguments(), plugin, file, lifeCycle, apis);
            return;
          }
          if (typeText !== '{}' &&
              typeText !== 'Promise<void>' &&
              typeText !== 'Promise<{}>' &&
              typeText !== 'void') {
            addImplicitApi({ returnType: m.getReturnType(), plugin, file, lifeCycle, apis });
          }
        }
      }
    });
  });
}

function addApiFromNode(
  node: Node,
  plugin: BasicPluginInfo,
  file: string,
  lifeCycle: string,
  apis: { [key: string]: Api }) {
  const publicOrServer = getPublicOrServer(file);
  const identifer = `${plugin}.${publicOrServer}.${lifeCycle}`;  
  if (Node.isInterfaceDeclaration(node)) {
    if (node.getName() === 'Promise') {
      console.warn(`${identifer} return type is a Promise. Is information being lost? Text is`, node.getText());
      return [];
    }

    console.log(`addPropertyRefsFromNode) Getting all properties for node ${identifer}`);

    node.getProperties().forEach(m => {
      const id = getApiId({ plugin: plugin.name, lifeCycle, publicOrServer, name});
      apis[id] = {
        plugin: plugin.name,
        file: { path: file },
        name: m.getName(),
        team: plugin.teamOwner,
        type: m.getKindName(),
        isStatic: false,
        id,
        node
      };
    });
  }
}

function addRefsForPromiseType(
  typeArgs: Type[],
  plugin: BasicPluginInfo,
  file: string,
  lifeCycle: string,
  apis: { [key: string]: Api }) {
  typeArgs.forEach(tp => {
    addImplicitApi({ file, returnType: tp, plugin, lifeCycle, apis});
  });
}


export async function addStaticApis(
  source: SourceFile,
  plugin: BasicPluginInfo,
  apis: { [key: string]: Api }) {
  const publicOrServer = getPublicOrServer(source.getFilePath());
  const exported = source.getExportedDeclarations();
  console.log(`Getting ${exported.size} static exports in file ${source.getFilePath()}`);
  exported.forEach(val => {
    val.forEach(ed => {
      // @ts-ignore
      let name: string = ed.getName ? ed.getName() : '';

      if (name === 'plugin' || name === 'config') {
        return;
      }

      if (name && name !== '') {
        const id = getApiId({ plugin: plugin.name, publicOrServer, name })
        apis[id] = {
          plugin: plugin.name,
          file: { path: source.getFilePath() },
          name,
          team: plugin.teamOwner,
          type: ed.getKindName(),
          isStatic: true,
          id,
          node: ed as any
        };
      }
    });
  });
}
