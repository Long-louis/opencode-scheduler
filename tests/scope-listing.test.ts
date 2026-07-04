import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { findJobByName, listScopeIds, mergeRunOverride } from "../src/index"

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scheduler-scope-listing-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("listScopeIds", () => {
  test("returns empty array when the scopes root does not exist", () => {
    const missing = join(root, "does-not-exist")
    expect(listScopeIds(missing)).toEqual([])
  })

  test("returns empty array when the scopes root is empty", () => {
    expect(listScopeIds(root)).toEqual([])
  })

  test("returns names of real scope subdirectories sorted ascending", () => {
    mkdirSync(join(root, "beta-scope", "jobs"), { recursive: true })
    mkdirSync(join(root, "alpha-scope", "jobs"), { recursive: true })

    const result = listScopeIds(root)

    expect(result).toEqual(["alpha-scope", "beta-scope"])
  })

  test("skips macOS Finder metadata files like .DS_Store", () => {
    mkdirSync(join(root, "real-scope", "jobs"), { recursive: true })
    writeFileSync(join(root, ".DS_Store"), Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]))

    const result = listScopeIds(root)

    expect(result).toEqual(["real-scope"])
  })

  test("skips plain files that share the scopes root with directories", () => {
    mkdirSync(join(root, "real-scope", "jobs"), { recursive: true })
    writeFileSync(join(root, "foo.txt"), "noise")
    writeFileSync(join(root, "leftover.json"), "{}")

    const result = listScopeIds(root)

    expect(result).toEqual(["real-scope"])
  })

  test("mixed real scope, .DS_Store, and stray file returns only the real scope", () => {
    mkdirSync(join(root, "real-scope", "jobs"), { recursive: true })
    mkdirSync(join(root, "another-real", "jobs"), { recursive: true })
    writeFileSync(join(root, ".DS_Store"), "mac noise")
    writeFileSync(join(root, "stray.txt"), "stray")

    const result = listScopeIds(root)

    expect(result).toEqual(["another-real", "real-scope"])
  })

  test("does not throw when a non-directory entry is encountered", () => {
    mkdirSync(join(root, "real-scope", "jobs"), { recursive: true })
    writeFileSync(join(root, ".DS_Store"), "mac noise")
    writeFileSync(join(root, "stray.txt"), "stray")

    expect(() => listScopeIds(root)).not.toThrow()
  })
})

describe("findJobByName", () => {
  test("falls back to jobs stored in another scope", () => {
    mkdirSync(join(root, "other-scope", "jobs"), { recursive: true })
    writeFileSync(
      join(root, "other-scope", "jobs", "nightly.json"),
      JSON.stringify({
        scopeId: "other-scope",
        slug: "nightly",
        name: "Nightly",
        schedule: "0 * * * *",
        prompt: "check",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    )

    expect(findJobByName("nightly", { scopeId: "missing-scope", scopesRoot: root })?.slug).toBe("nightly")
  })

  test("finds source-prefixed jobs by display name or actual slug", () => {
    mkdirSync(join(root, "source-scope", "jobs"), { recursive: true })
    writeFileSync(
      join(root, "source-scope", "jobs", "opencode-tracka-baseline1-watchdog.json"),
      JSON.stringify({
        scopeId: "source-scope",
        slug: "opencode-tracka-baseline1-watchdog",
        name: "tracka-baseline1-watchdog",
        source: "opencode",
        schedule: "*/30 * * * *",
        prompt: "check",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    )

    expect(findJobByName("tracka-baseline1-watchdog", { scopeId: "missing-scope", scopesRoot: root })?.slug).toBe(
      "opencode-tracka-baseline1-watchdog"
    )
    expect(findJobByName("opencode-tracka-baseline1-watchdog", { scopeId: "missing-scope", scopesRoot: root })?.name).toBe(
      "tracka-baseline1-watchdog"
    )
  })
})

describe("mergeRunOverride", () => {
  test("ignores empty string overrides from MCP optional string defaults", () => {
    const run = mergeRunOverride(
      { prompt: "original prompt", session: "ses_existing", continue: true },
      { prompt: "", command: "", session: "", runFormat: "" }
    )

    expect(run).toEqual({ prompt: "original prompt", session: "ses_existing", continue: true })
  })
})
