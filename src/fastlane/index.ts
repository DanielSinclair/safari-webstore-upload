
import { ConvertWebExtensionAction, ConvertWebExtensionOptions } from "~fastlane/actions/convert"
import { MatchAction, MatchOptions } from "~fastlane/actions/match"
import { GymAction, GymOptions, GymOutput } from "~fastlane/actions/gym"
import { PilotAction, PilotOptions } from "~fastlane/actions/pilot"
import { DeliverAction, DeliverOptions } from "~fastlane/actions/deliver"
import { UpdateProjectTeamAction } from "~fastlane/actions/updateProjectTeam"
import { SetupCIAction } from "~fastlane/actions/setupCI"
import { getLogger } from "~util/logging"
import { FastlaneAPIKey, APIKey } from "~fastlane/config/auth"
import { FastlaneAppfile, Appfile } from "~fastlane/config/appfile"
import { FastlaneMatchfile, Matchfile } from "~fastlane/config/matchfile"
import { FastlaneGymfile, Gymfile } from "~fastlane/config/gymfile"
import type { Options } from "~/index"
import { XcodeProject, XcodeWorkspace } from "~xcode"

const log = getLogger()

export type FastlaneOptions = {
  workspace: string,
  key: APIKey,
  appfile: Appfile,
  matchfile: Matchfile,
  gymfile: Gymfile,
  platforms: string[]
}

export class FastlaneClient {
  options: FastlaneOptions
  apiKeyPath: string

  constructor(options: FastlaneOptions) {
    this.options = options
  }

  // generate hardcoded Fastlane files
  // auth with developer portal and itunes connect
  async configure() {
    log.info("Configuring Fastlane...")
    const { workspace } = this.options
    
    const appfile = new FastlaneAppfile(this.options.appfile)
    await appfile.persist(workspace)

    const key = new FastlaneAPIKey(this.options.key)
    this.apiKeyPath = await key.persist(workspace)

    const matchfile = new FastlaneMatchfile({
      api_key_path: this.apiKeyPath,
      ...this.options.matchfile
    })
    await matchfile.persist(workspace)

    const gymfile = new FastlaneGymfile(this.options.gymfile)
    await gymfile.persist(workspace)

    log.success("Fastlane configuration generated")
  }

  async setupCI() {
    const cwd = this.options.workspace
    const setupCI = new SetupCIAction({ force: true }, { cwd })
    await setupCI.setup()
  }

  // generate Xcode project and workspace from extension folder
  async convert(extensionPath: string, options?: ConvertWebExtensionOptions) {
    const cwd = this.options.workspace
    log.info("Converting extension...")
    const cwe = new ConvertWebExtensionAction(options, { cwd })
    await cwe.convert(extensionPath)
    log.success("Conversion complete, and Xcode project generated")
    const xcodeprojs = await XcodeProject.findProjects(cwd)
    const xcodeproj = xcodeprojs[0]
    await XcodeWorkspace.generate(cwd, xcodeproj.name, xcodeprojs)
  }

  async updateProjectTeam(teamid: string) {
    const cwd = this.options.workspace
    const xcodeprojs = await XcodeProject.findProjects(cwd)
    log.debug("Updating project teams...")
    for (const xcodeproj of xcodeprojs) {
      const { filePath } = xcodeproj
      const updateTeam = new UpdateProjectTeamAction({ teamid, path: filePath }, { cwd })
      await updateTeam.update()
    }
  }

  async match(options?: Options) {
    await this.codeSigningSetup()
  }

  private async codeSigningSetup() {
    const actionOptions = { cwd: this.options.workspace }
    const type = "appstore"
    for (const platform of this.options.platforms) {
      log.debug(`Gathering ${platform} codesigning materials for ${type}...`)
      const matchOptions = { type, platform, readonly: true } as MatchOptions
      const match = new MatchAction(matchOptions, actionOptions)
      await match.syncCodeSigning()
    }
  }

  // build and sign app
  async gym(options?: GymOptions): Promise<GymOutput> {
    const actionOptions = { cwd: this.options.workspace }
    const gym = new GymAction(options, actionOptions)
    return await gym.buildSchemes()
  }

  // upload and deploy to testflight
  async pilot(options?: PilotOptions) {
    const pilot = new PilotAction(options)
  }

  // upload and submit to the app store
  async deliver(options?: DeliverOptions) {
    const deliver = new DeliverAction(options, { cwd: this.options.workspace })
    await deliver.upload()
  }
}