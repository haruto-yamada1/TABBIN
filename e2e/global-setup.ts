/* eslint-disable import/no-anonymous-default-export, import/no-default-export, typescript/no-require-imports, unicorn/no-anonymous-default-export, typescript/no-var-requires, eslint/no-unused-vars, typescript/no-unsafe-assignment */
// @ts-check
const { chromium } = require('playwright')

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  use: {
    baseURL: 'http://localhost:5173',
  },
}

module.exports = config
