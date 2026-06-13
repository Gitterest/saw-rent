import { spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error("Usage: node scripts/gradle.mjs <gradle-task> [...gradle-args]")
  process.exit(1)
}

function javaExecutable(home) {
  if (!home) return ""
  return path.join(home, "bin", process.platform === "win32" ? "java.exe" : "java")
}

function hasUsableJavaHome(home) {
  if (!home || !existsSync(javaExecutable(home))) {
    return false
  }

  if (process.platform === "win32" && !existsSync(path.join(home, "lib", "jvm.cfg"))) {
    return false
  }

  return true
}

function appendJavaToolOption(current, option) {
  return current?.includes(option) ? current : [current, option].filter(Boolean).join(" ")
}

function resolveEnv() {
  const env = { ...process.env }
  const localJdk = path.resolve(".tools", "temurin21", "jdk-21.0.11+10")

  if (hasUsableJavaHome(localJdk)) {
    env.JAVA_HOME = localJdk
    env.Path = `${path.join(localJdk, "bin")}${path.delimiter}${env.Path || env.PATH || ""}`
  } else if (!hasUsableJavaHome(env.JAVA_HOME)) {
    console.error("No usable Java home found. Install JDK 21 or restore .tools/temurin21.")
    process.exit(1)
  }

  env.GRADLE_USER_HOME = env.GRADLE_USER_HOME || path.resolve(".gradle-home", "android-build")
  mkdirSync(env.GRADLE_USER_HOME, { recursive: true })

  env.ANDROID_USER_HOME = env.ANDROID_USER_HOME || path.resolve(".android-home")
  mkdirSync(env.ANDROID_USER_HOME, { recursive: true })

  env.JAVA_TOOL_OPTIONS = appendJavaToolOption(
    env.JAVA_TOOL_OPTIONS,
    `-Duser.home=${env.ANDROID_USER_HOME}`,
  )

  // Android Gradle Plugin rejects setting both ANDROID_USER_HOME and the
  // deprecated ANDROID_SDK_HOME as preference locations. Keep preferences local
  // through ANDROID_USER_HOME and leave SDK discovery to ANDROID_HOME/SDK_ROOT.
  delete env.ANDROID_SDK_HOME

  return env
}

const androidDir = path.resolve("android")
const executable = process.platform === "win32" ? "gradlew.bat" : "./gradlew"
const noDaemonExemptArgs = new Set(["--stop", "--status", "--version", "-v"])
const shouldAppendNoDaemon = !args.includes("--no-daemon") &&
  !args.includes("--daemon") &&
  !args.some((arg) => noDaemonExemptArgs.has(arg))
const gradleArgs = shouldAppendNoDaemon ? [...args, "--no-daemon"] : args
const shouldStopDaemons = !args.some((arg) => noDaemonExemptArgs.has(arg))

function runGradle(runArgs, env) {
  return new Promise((resolve) => {
    const child = spawn(executable, runArgs, {
      cwd: androidDir,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    })

    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal })
    })
  })
}

const env = resolveEnv()

if (shouldStopDaemons) {
  const stopResult = await runGradle(["--stop"], env)
  if (stopResult.signal) {
    console.error(`Gradle daemon stop exited from signal ${stopResult.signal}`)
    process.exit(1)
  }
  if (stopResult.code !== 0) {
    process.exit(stopResult.code)
  }
}

const result = await runGradle(gradleArgs, env)
if (result.signal) {
  console.error(`Gradle exited from signal ${result.signal}`)
  process.exit(1)
}

process.exit(result.code)
