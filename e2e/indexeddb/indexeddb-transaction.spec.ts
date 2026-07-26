import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

test('native transaction contract and browser capability snapshot', async ({
  browserName,
  page,
}) => {
  const databaseName = `tabbin-indexeddb-smoke-${randomUUID()}`
  await page.route('http://tabbin.test/**', async (route) => {
    await route.fulfill({
      body: '<!doctype html><title>IndexedDB smoke</title>',
    })
  })
  await page.goto('http://tabbin.test/indexeddb-smoke')
  const result = await page.evaluate(async (name) => {
    const toError = (value: unknown, message: string): Error =>
      value instanceof Error ? value : new Error(message)
    const open = async (
      databaseName: string,
      version: number,
    ): Promise<IDBDatabase> => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, version)
        request.addEventListener('error', () => {
          reject(toError(request.error, 'Failed to open IndexedDB.'))
        })
        request.addEventListener('upgradeneeded', () => {
          if (!request.result.objectStoreNames.contains('records')) {
            const records = request.result.createObjectStore('records', {
              keyPath: 'id',
            })
            records.createIndex('value', 'value', { unique: true })
          }
          if (!request.result.objectStoreNames.contains('metadata')) {
            request.result.createObjectStore('metadata', { keyPath: 'id' })
          }
        })
        request.addEventListener('success', () => {
          resolve(request.result)
        })
      })
    }
    const transactionDone = async (
      transaction: IDBTransaction,
    ): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('abort', () => {
          reject(toError(transaction.error, 'IndexedDB transaction aborted.'))
        })
        transaction.addEventListener('complete', () => {
          resolve()
        })
      })
    }

    const database = await open(name, 1)
    const strict = database.transaction('records', 'readwrite', {
      durability: 'strict',
    })
    const supportsExplicitCommit = typeof strict.commit === 'function'
    const reportedDurability = strict.durability
    strict.objectStore('records').put({ id: 'committed' })
    if (supportsExplicitCommit) {
      strict.commit()
    }
    await transactionDone(strict)

    const aborted = database.transaction('records', 'readwrite')
    aborted.objectStore('records').put({ id: 'aborted' })
    const abortFinished = new Promise<void>((resolve) => {
      aborted.addEventListener('abort', () => {
        resolve()
      })
    })
    aborted.abort()
    await abortFinished

    const constraintFailure = database.transaction(
      ['records', 'metadata'],
      'readwrite',
    )
    constraintFailure.objectStore('metadata').put({ id: 'revision', value: 1 })
    constraintFailure
      .objectStore('records')
      .put({ id: 'duplicate-a', value: 'duplicate' })
    constraintFailure
      .objectStore('records')
      .put({ id: 'duplicate-b', value: 'duplicate' })
    const uniqueConstraintAborted = await new Promise<boolean>(
      (resolve, reject) => {
        constraintFailure.addEventListener('abort', () => {
          resolve(constraintFailure.error?.name === 'ConstraintError')
        })
        constraintFailure.addEventListener('complete', () => {
          reject(
            new Error('Unique constraint transaction unexpectedly committed.'),
          )
        })
      },
    )

    let versionChangeObserved = false
    database.addEventListener('versionchange', () => {
      versionChangeObserved = true
      database.close()
    })
    const upgraded = await open(name, 2)
    const read = upgraded.transaction(['records', 'metadata'], 'readonly')
    const committedRequest = read.objectStore('records').get('committed')
    const abortedRequest = read.objectStore('records').get('aborted')
    const duplicateRequest = read.objectStore('records').get('duplicate-a')
    const revisionRequest = read.objectStore('metadata').get('revision')
    const records = await new Promise<{
      aborted: unknown
      committed: unknown
      duplicate: unknown
      revision: unknown
    }>((resolve, reject) => {
      read.addEventListener('abort', () => {
        reject(toError(read.error, 'IndexedDB read transaction aborted.'))
      })
      read.addEventListener('complete', () => {
        resolve({
          aborted: abortedRequest.result,
          committed: committedRequest.result,
          duplicate: duplicateRequest.result,
          revision: revisionRequest.result,
        })
      })
    })
    upgraded.close()
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(name)
      deletion.addEventListener('error', () => {
        reject(toError(deletion.error, 'Failed to delete IndexedDB database.'))
      })
      deletion.addEventListener('success', () => {
        resolve()
      })
    })

    return {
      committedRecordExists: Boolean(records.committed),
      constraintTransactionRolledBack:
        records.duplicate === undefined && records.revision === undefined,
      reportedDurability,
      rolledBackRecordMissing: records.aborted === undefined,
      supportsExplicitCommit,
      uniqueConstraintAborted,
      versionChangeObserved,
    }
  }, databaseName)

  expect(result).toEqual({
    committedRecordExists: true,
    constraintTransactionRolledBack: true,
    reportedDurability: 'strict',
    rolledBackRecordMissing: true,
    supportsExplicitCommit: true,
    uniqueConstraintAborted: true,
    versionChangeObserved: true,
  })
  test.info().annotations.push({
    description: JSON.stringify(result),
    type: `${browserName}-indexeddb-capabilities`,
  })
})
