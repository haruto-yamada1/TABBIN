import { describe, expect, it } from 'vitest'

import { verifyToolchainVersions } from './verify-toolchain-versions.ts'

const validInputs = {
  nodeVersionFile: '24',
  bunVersionFile: '1.3.14',
  packageJson: {
    engines: { node: '24.x', bun: '1.3.14' },
    packageManager: 'bun@1.3.14',
    devDependencies: { '@types/node': '^24.0.0' },
  },
  ciWorkflow: `
    - uses: actions/setup-node@foo
      with:
        node-version-file: '.node-version'
    - uses: oven-sh/setup-bun@bar
      with:
        bun-version-file: '.bun-version'
  `,
}

describe('verifyToolchainVersions', () => {
  it('passes when all toolchain version sources are in sync', () => {
    expect(verifyToolchainVersions(validInputs)).toEqual({
      nodeMajor: 24,
      bunVersion: '1.3.14',
    })
  })

  it('throws when Node major from .node-version differs from engines.node', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        nodeVersionFile: '22',
      }),
    ).toThrow(
      /Node major mismatch[\s\S]*- \.node-version: 22 \(major 22\)[\s\S]*- engines\.node: 24\.x \(major 24\)/,
    )
  })

  it('throws when Node major from .node-version differs from @types/node', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        packageJson: {
          ...validInputs.packageJson,
          devDependencies: { '@types/node': '^22.0.0' },
        },
      }),
    ).toThrow(
      /Node major mismatch[\s\S]*- \.node-version: 24 \(major 24\)[\s\S]*- @types\/node: \^22\.0\.0 \(major 22\)/,
    )
  })

  it('throws when Bun version differs between .bun-version and engines.bun', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        bunVersionFile: '1.3.15',
      }),
    ).toThrow(
      /Bun version mismatch[\s\S]*- \.bun-version: 1\.3\.15[\s\S]*- engines\.bun: 1\.3\.14/,
    )
  })

  it('throws when Bun version differs between .bun-version and packageManager', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        bunVersionFile: '1.3.15',
        packageJson: {
          ...validInputs.packageJson,
          engines: { node: '24.x', bun: '1.3.15' },
        },
      }),
    ).toThrow(
      /Bun version mismatch[\s\S]*- \.bun-version: 1\.3\.15[\s\S]*- packageManager: bun@1\.3\.14/,
    )
  })

  it('throws when a setup-node step uses a hardcoded node-version', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        ciWorkflow: `
          - uses: actions/setup-node@foo
            with:
              node-version-file: '.node-version'
          - uses: actions/setup-node@foo
            with:
              node-version: '26'
        `,
      }),
    ).toThrow(
      /Found actions\/setup-node step using hardcoded node-version instead of node-version-file/,
    )
  })

  it('throws when a setup-bun step uses a hardcoded bun-version', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        ciWorkflow: `
          - uses: oven-sh/setup-bun@bar
            with:
              bun-version-file: '.bun-version'
          - uses: oven-sh/setup-bun@bar
            with:
              bun-version: '1.3.15'
        `,
      }),
    ).toThrow(
      /Found oven-sh\/setup-bun step using hardcoded bun-version instead of bun-version-file/,
    )
  })

  it('throws when no setup-node step references .node-version', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        ciWorkflow: "bun-version-file: '.bun-version'",
      }),
    ).toThrow(/No actions\/setup-node step found referencing \.node-version/)
  })

  it('throws when no setup-bun step references .bun-version', () => {
    expect(() =>
      verifyToolchainVersions({
        ...validInputs,
        ciWorkflow: "node-version-file: '.node-version'",
      }),
    ).toThrow(/No oven-sh\/setup-bun step found referencing \.bun-version/)
  })
})
