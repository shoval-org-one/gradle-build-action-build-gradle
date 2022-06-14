import * as exec from '@actions/exec'
import * as artifact from '@actions/artifact'
import * as glob from '@actions/glob'
import fs from 'fs'
import path from 'path'
import {cacheDebug, isCacheDebuggingEnabled} from './cache-utils'

export class CacheCleaner {
    private readonly gradleUserHome: string
    private readonly tmpDir: string

    constructor(gradleUserHome: string, tmpDir: string) {
        this.gradleUserHome = gradleUserHome
        this.tmpDir = tmpDir
    }

    async prepare(): Promise<void> {
        cacheDebug(`Preparing Gradle User Home for future cleanup`)

        this.debugReportGradleUserHomeContents()

        fs.rmSync(path.resolve(this.gradleUserHome, 'caches/journal-1'), {recursive: true, force: true})
        fs.mkdirSync(path.resolve(this.gradleUserHome, 'caches/journal-1'), {recursive: true})
        fs.writeFileSync(
            path.resolve(this.gradleUserHome, 'caches/journal-1/file-access.properties'),
            'inceptionTimestamp=0'
        )
        await this.ageAllFiles()
        await this.touchAllFiles('gc.properties')
    }

    async forceCleanup(): Promise<void> {
        cacheDebug(`Forcing Gradle User Home cleanup`)

        cacheDebug('BEFORE CLEANUP')
        this.debugReportGradleUserHomeContents()

        await this.ageAllFiles('gc.properties')

        const cleanupProjectDir = path.resolve(this.tmpDir, 'dummy-cleanup-project')
        fs.mkdirSync(cleanupProjectDir, {recursive: true})
        fs.writeFileSync(
            path.resolve(cleanupProjectDir, 'settings.gradle'),
            'rootProject.name = "dummy-cleanup-project"'
        )
        fs.writeFileSync(path.resolve(cleanupProjectDir, 'build.gradle'), 'task("noop") {}')

        await exec.exec(`gradle -g ${this.gradleUserHome} --no-daemon --build-cache --no-scan --quiet noop`, [], {
            cwd: cleanupProjectDir
        })

        cacheDebug(`AFTER CLEANUP`)
        this.debugReportGradleUserHomeContents()

        this.uploadGradleUserHome()
    }

    private async ageAllFiles(fileName = '*'): Promise<void> {
        await exec.exec(
            'find',
            [this.gradleUserHome, '-name', fileName, '-exec', 'touch', '-m', '-d', '1970-01-01', '{}', '+'],
            {}
        )
    }

    private async touchAllFiles(fileName = '*'): Promise<void> {
        await exec.exec('find', [this.gradleUserHome, '-name', fileName, '-exec', 'touch', '-m', '{}', '+'], {})
    }

    private async debugReportGradleUserHomeContents(): Promise<void> {
        if (!isCacheDebuggingEnabled()) {
            return
        }
        if (!fs.existsSync(this.gradleUserHome)) {
            return
        }
        await exec.exec('du', ['-a'], {
            cwd: this.gradleUserHome,
            ignoreReturnCode: true
        })
    }

    private async uploadGradleUserHome(): Promise<void> {
        if (!isCacheDebuggingEnabled()) {
            return
        }
        if (!fs.existsSync(this.gradleUserHome)) {
            return
        }
        const globber = await glob.create(`${this.gradleUserHome}/**/*`)
        const rawSearchResults: string[] = await globber.glob()
        const artifactClient = artifact.create()
        await artifactClient.uploadArtifact('gradle-user-home', rawSearchResults, this.gradleUserHome)
    }
}
