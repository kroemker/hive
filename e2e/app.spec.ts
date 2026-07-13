import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  app = await electron.launch({ args: [path.join(__dirname, '../out/main/index.js')] })
  window = await app.firstWindow()
})

test.afterAll(async () => {
  await app.close()
})

test('shows the Hive window with a way to open a repo folder', async () => {
  await expect(window).toHaveTitle('Hive')
  await expect(window.getByRole('heading', { name: 'Hive' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Open repository folder' })).toBeVisible()
})
