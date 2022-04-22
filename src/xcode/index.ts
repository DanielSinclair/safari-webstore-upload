
import { getVerboseLogger } from "~util/logging"
import { findFileByExtName, filterFilesByExtName } from '~util/file'
import fs from 'fs-extra'
import xml from 'xml'
import path from 'path'
import XcodeBuild from '~xcode/xcrun/xcodebuild'
import plist from 'plist'

const vLog = getVerboseLogger()

export class XcodeWorkspace {
  filePath: string
  parentDirectory: string
  name: string
  xcodeBuild: XcodeBuild

  constructor(filePath: string) {
    this.filePath = filePath
    this.parentDirectory = path.dirname(filePath)
    this.name = path.basename(filePath, '.xcworkspace')
    this.xcodeBuild = new XcodeBuild(this.parentDirectory)
  }
  
  static async findWorkspace(dir: string): Promise<XcodeWorkspace|null> {
    const relativeWorkspacePath = await findFileByExtName(dir, '.xcworkspace', 1)
    return relativeWorkspacePath ? new XcodeWorkspace(`${dir}/${relativeWorkspacePath}`) : null
  }

  static async generate(dir: string, name: string, xcodeprojs: XcodeProject[]) {
    const fileRefs = xcodeprojs.map(xcodeproj => {
      const { filePath } = xcodeproj
      return { FileRef: [{ _attr: { location: `container:${filePath}` }}] }
    })
    const workspace = { Workspace: [{ _attr: { version: '1.0' }}, ...fileRefs] }
    const xmlString = xml(workspace, { declaration: true, indent: '\t' })
    const workspaceDirectory = `${dir}/${name}.xcworkspace`
    await fs.ensureDir(workspaceDirectory)
    await fs.writeFile(`${workspaceDirectory}/contents.xcworkspacedata`, xmlString)
  }

  async workspace() {
    const json = await this.xcodeBuild.list()
    return json.workspace
  }

  async schemes(): Promise<string[]> {
    vLog("Fetching Xcode Workspace schemes...")
    const workspace = await this.workspace()
    return workspace.schemes.slice(0, 2)
  }

  private async findInfoPlists(): Promise<string[]> {
    const plists = await filterFilesByExtName(this.parentDirectory, '.plist', 3)
    return plists.filter((plist) => {
      return plist.endsWith('(App)/Info.plist')
    }).map((plistPath) => {
      return `${this.parentDirectory}/${plistPath}`
    })
  }

  async writeKeyToInfoPlists(key: string, value: any) {
    vLog(`Writing ${key}:${value} to info plists...`)
    const plists = await this.findInfoPlists()
    for (const plistPath of plists) {
      vLog(`Reading ${plistPath}`)
      const xmlString = await fs.readFileSync(plistPath, 'utf8')
      const json = plist.parse(xmlString)
      json[key] = value
      const jsonString = plist.build(json)
      vLog(`Writing ${key}:${value} to ${plistPath}`)
      await fs.writeFileSync(plistPath, jsonString, 'utf8')
    }
  }
}

export class XcodeProject extends XcodeWorkspace {
  
  constructor(filePath: string) {
    super(filePath)
    this.name = path.basename(filePath, '.xcodeproj')
  }

  static async findProjects(dir: string): Promise<XcodeProject[]> {
    const workspacePaths = await filterFilesByExtName(dir, '.xcodeproj', 2)
    return workspacePaths.map(path => new XcodeProject(path))
  }

  async project() {
    const json = await this.xcodeBuild.list()
    return json.project
  }
  
  async schemes(): Promise<string[]> {
    vLog("Fetching Xcode Project schemes...")
    const project = await this.project()
    return project.schemes
  }
  
  async targets(): Promise<string[]> {
    vLog("Fetching Xcode Project targets...")
    const project = await this.project()
    return project.targets
  }
}