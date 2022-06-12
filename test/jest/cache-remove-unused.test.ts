import * as exec from '@actions/exec'
import fs from 'fs'
import path from 'path'

jest.setTimeout(60000)

test('will cleanup unused dependency jars and build-cache entries', async () => {
    const projectRoot = prepareTestProject()

    await runGradleBuild(projectRoot, 'build', '3.1')
    
    await resetUsageState(projectRoot)

    await runGradleBuild(projectRoot, 'build', '3.1.1')

    const commonsMath31 = path.resolve(projectRoot, "HOME/caches/modules-2/files-2.1/org.apache.commons/commons-math3/3.1")
    const commonsMath311 = path.resolve(projectRoot, "HOME/caches/modules-2/files-2.1/org.apache.commons/commons-math3/3.1.1")
    const buildCacheDir = path.resolve(projectRoot, "HOME/caches/build-cache-1")

    expect(fs.existsSync(commonsMath31)).toBe(true)
    expect(fs.existsSync(commonsMath311)).toBe(true)
    expect(fs.readdirSync(buildCacheDir).length).toBe(4)

    await forceUnusedCleanup(projectRoot)

    expect(fs.existsSync(commonsMath31)).toBe(false)
    expect(fs.existsSync(commonsMath311)).toBe(true)
    expect(fs.readdirSync(buildCacheDir).length).toBe(3)
})

test('will cleanup unused gradle versions', async () => {
    const projectRoot = prepareTestProject()

    // Initialize HOME with 2 different Gradle versions
    await runGradleWrapperBuild(projectRoot, 'build')
    await runGradleBuild(projectRoot, 'build')
    
    await resetUsageState(projectRoot)

    // Run with only one of these versions
    await runGradleBuild(projectRoot, 'build')

    const gradle733 = path.resolve(projectRoot, "HOME/caches/7.3.3")
    const wrapper733 = path.resolve(projectRoot, "HOME/wrapper/dists/gradle-7.3.3-bin")
    const gradle741 = path.resolve(projectRoot, "HOME/caches/7.4.1")

    expect(fs.existsSync(gradle733)).toBe(true)
    expect(fs.existsSync(wrapper733)).toBe(true)
    expect(fs.existsSync(gradle741)).toBe(true)

    await forceUnusedCleanup(projectRoot)

    expect(fs.existsSync(gradle733)).toBe(false)
    expect(fs.existsSync(wrapper733)).toBe(false)
    expect(fs.existsSync(gradle741)).toBe(true)
})

async function runGradleBuild(projectRoot: string, args: string, version: string = '3.1'): Promise<void> {
    const status31 = await exec.exec(`gradle -g HOME --no-daemon --build-cache -Dcommons-math3.version=${version} ${args}`, [], {
        cwd: projectRoot
    })
    console.log(`Gradle User Home initialized with commons-math3.version=${version} ${args}`)
}

async function runGradleWrapperBuild(projectRoot: string, args: string, version: string = '3.1'): Promise<void> {
    const status31 = await exec.exec(`./gradlew -g HOME --no-daemon --build-cache -Dcommons-math3.version=${version} ${args}`, [], {
        cwd: projectRoot
    })
    console.log(`Gradle User Home initialized with commons-math3.version=${version} ${args}`)
}

function prepareTestProject(): string {
    const projectRoot = 'test/jest/resources/unused-dependencies'
    fs.rmSync(path.resolve(projectRoot, 'HOME'), { recursive: true, force: true })
    fs.rmSync(path.resolve(projectRoot, 'build'), { recursive: true, force: true })
    fs.rmSync(path.resolve(projectRoot, '.gradle'), { recursive: true, force: true })
    return projectRoot
}

async function resetUsageState(projectRoot: string): Promise<void> {
    fs.rmSync(path.resolve(projectRoot, 'HOME/caches/journal-1'), { recursive: true, force: true })
    fs.mkdirSync(path.resolve(projectRoot, 'HOME/caches/journal-1'), { recursive: true })
    fs.writeFileSync(path.resolve(projectRoot, 'HOME/caches/journal-1/file-access.properties'), 'inceptionTimestamp=0')
    await ageAllFiles(path.resolve(projectRoot, 'HOME'))
    await touchAllFiles(path.resolve(projectRoot, 'HOME'), 'gc.properties')
}

async function forceUnusedCleanup(projectRoot: string) {
    await ageAllFiles(path.resolve(projectRoot, 'HOME'), 'gc.properties')

    const statusCleanup = await exec.exec('gradle -g HOME --no-daemon --build-cache help', [],{
        cwd: projectRoot
    })
    console.log('Cleaned up HOME')
}

async function ageAllFiles(dirPath: string, fileName: string = '*'): Promise<void> {
    await exec.exec('find', [dirPath, '-name', fileName, '-exec', 'touch', '-m', '-d', '1970-01-01', '{}', '+'], {})
}

async function touchAllFiles(dirPath: string, fileName: string = '*'): Promise<void> {
    await exec.exec('find', [dirPath, '-name', fileName, '-exec', 'touch', '-m', '{}', '+'], {})
}
